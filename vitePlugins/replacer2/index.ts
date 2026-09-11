import * as ts from 'typescript';
import type { Plugin } from 'vite';
import * as path from 'path';
import MagicString from "magic-string";

import { isAwaitAddTransformerVist, getAwaitTargets, directAsyncFunction, loopChange, changeAsyncFunction, isTargetEventAssignment, transformIfBody } from './helper.ts';
import { hasSkipComment } from '../vite-plugin-ts-code-replacer/utils/plugins-helpers.ts';

export function vitePluginAutoAwait(): Plugin {
	let program: ts.Program | null = null;
	let typeChecker: ts.TypeChecker | null = null;
	const targetVariableNames = new Set<string>();
	const inMemoryCache = new Map<string, string>();
	let compilerOptions: ts.CompilerOptions = {};
	let configFileNames: string[] = [];
	const awaitTargetList : string[] = [];
	return {
		name: 'vite-plugin-auto-await',
    	enforce: 'pre',
		async configResolved() {
			const _awaitTargetList = getAwaitTargets();
			awaitTargetList.push( ..._awaitTargetList);
			console.log(awaitTargetList);
		},
    	// 💡 プロジェクト起動時に tsconfig.json を読み込んで、型環境を完全に構築する
    	buildStart() {
      		const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json');
      		if (!configPath) {
        		console.error("tsconfig.json が見つかりません。");
        		return;
      		}

	      	// tsconfig.json の中身をパース
    	  	const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
    		const configParseResult = ts.parseJsonConfigFileContent(
        		readResult.config,
	        	ts.sys,
    	    	path.dirname(configPath)
      		);
			compilerOptions = {
				...configParseResult.options,
				//target: ts.ScriptTarget.ES2022,
		        //module: ts.ModuleKind.ESNext,
        		sourceMap: true,       // 🚨 これにより、emit時に元の位置に紐づくマップが自動生成されます
        		inlineSources: true,   // 元のコードをマップに含める
				//noEmit : false,
				//emitDeclarationOnly: true,
				//experimentalDecorators: true,
				removeComments: false, // JSDoc を強制的にパースさせるため、オプションを上書き
			}
			//compilerOptions.experimentalDecorators = false;
			configFileNames = configParseResult.fileNames;

	      	// プロジェクト全体のファイルを最初からすべて含んだ Program を作成
    	  	program = ts.createProgram(configParseResult.fileNames, compilerOptions);
			typeChecker = program.getTypeChecker();
    	},
		buildEnd() {
			//targetVariableNames.clear();
			inMemoryCache.clear();
			program = null;
		},
	    transform(code, id) {
    		// node_modules やに対象外のファイルはスルー
    		if (!id.endsWith('.ts') && !id.endsWith('.tsx') || id.includes('node_modules')) return null;
    		if (!id.includes('testV2')) return null; // testV2 のときだけ実行する
    		if (!program) return null;
			const printer = ts.createPrinter({ removeComments: false });
			const magicSource = new MagicString(code);
			// 新しくパースせず、すでに Program が持っている「型と紐付いた SourceFile」を取得する
			const sourceFile = program.getSourceFile(id);
			if(!sourceFile) {
				// もし新規追加されたファイルなどで Program に存在しない場合は、
    		    // 必要に応じて program を再構築するロジック（後述）を入れるか、一旦スキップします
				// ここではいったんスキップを選択しています
				return null;
			}
			// HMR（ファイルの書き換え）対応：必要に応じてプログラムを再作成
			const normalizedId = path.normalize(id).replace(/\\/g, '/');
			// 💡 1. 【超重要】Viteが検知した「エディタからの最新コード」をインメモリに即時上書き保存
    		inMemoryCache.set(normalizedId, code);
			// 💡 2. 【超重要】ファイル読み込みをインターセプトするカスタムホストを作成
    		const defaultHost = ts.createCompilerHost(compilerOptions);
			const customHost: ts.CompilerHost = {
				...defaultHost,
				// TypeScript がファイルを要求した時、メモリに最新の修正コードがあればそれをパースして返す
				getSourceFile: (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
        			const normFileName = path.normalize(fileName).replace(/\\/g, '/');
        			if (inMemoryCache.has(normFileName)) {
            			return ts.createSourceFile(
            				fileName,
            				inMemoryCache.get(normFileName)!, // 最新の保存コード
            				languageVersion,
            				true // setParentNodes: true
            			);
          			}
        			return defaultHost.getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
        		},
        		fileExists: (fileName) => {
        			const normFileName = path.normalize(fileName).replace(/\\/g, '/');
        			return inMemoryCache.has(normFileName) || defaultHost.fileExists(fileName);
        		}
			}
			// 💡 3. 【超重要】最新の変更状態を反映した状態で Program と TypeChecker をビルドする
    		// これを挟まないと、何回保存しても初期状態のコードがトランスフォームされ続けます
    		program = ts.createProgram([...configFileNames, normalizedId], compilerOptions, customHost);
      		const typeChecker = program.getTypeChecker();
			//const currentSourceFile = program.getSourceFile(normalizedId);
			//if (!currentSourceFile) return null;

	      	let isModified = false;
			const transformerFactory: ts.TransformerFactory<ts.SourceFile> = (context) => {
				targetVariableNames.clear();
		        return (rootSourcefile: ts.SourceFile) => {

					/** スレッドを格納している変数定義をスキャンする */
					function preScan(node: ts.Node): void {
						//targetVariableNames.clear();
						if (isTargetEventAssignment(node)) {
							console.log('is target event assignment')
							const binaryExpr = node as ts.BinaryExpression;
							if (ts.isIdentifier(binaryExpr.right)) {
								targetVariableNames.add(binaryExpr.right.text);
							}
						}
						ts.forEachChild(node, preScan);
					}
					preScan(rootSourcefile);

					const codeGenerater = (node: ts.Node): string => {
						const code = printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
						return code;
					}	
					const magicSourceOverwrite = (node: ts.Node, newNode: ts.Node) => {
						const code = codeGenerater(newNode);
						const start = node.getStart(sourceFile);
						const end = node.end;
						magicSource.overwrite(start, end, code);
					}
					const visitor = (node: ts.Node, inLoop:boolean = false): ts.Node => {
						// 変数定義されたメソッドを async function*() 化する
						if (ts.isVariableDeclaration(node) && node.initializer && ts.isFunctionExpression(node.initializer)) {
							console.log('targetVariableNames=',targetVariableNames)
							if (ts.isIdentifier(node.name) && targetVariableNames.has(node.name.text)) {
								const [change, variableNode] = changeAsyncFunction(node, visitor, inLoop);
								if(change){
									const generatedCode0 = printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
									console.log('generatedCode[b0]=', generatedCode0)
									const firstLine0 = generatedCode0.split('\n')[0]; 
									const generatedCode = printer.printNode(ts.EmitHint.Unspecified, variableNode, sourceFile);
									const firstLine = generatedCode.split('\n')[0];
									console.log('generatedCode[a]=', generatedCode);
									const start = node.getStart(sourceFile);
									const end = node.end;
									//magicSource.overwrite(start, end, generatedCode);
									magicSource.overwrite(start, start+firstLine0.length, firstLine);
									isModified = true;
									//ts.setTextRange(variableNode, node);
									return variableNode;
								}
							}
						}
						// 直接のイベント代入の検知と変換
						if (isTargetEventAssignment(node)) {
							const [change, updateBinaryExpression] = directAsyncFunction(node, visitor, inLoop);
							if(change){
								const generatedCode0 = printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
								console.log('generatedCode[b0]=', generatedCode0)
								const firstLine0 = generatedCode0.split('\n')[0]; 
								const generatedCode = printer.printNode(ts.EmitHint.Unspecified, updateBinaryExpression, sourceFile);
								console.log('generatedCode[b]=', generatedCode);
								const firstLine = generatedCode.split('\n')[0];
								console.log('generatedCode[b][0]=', firstLine);
								const start = node.getStart(sourceFile);
								const end = node.end;
								console.log('start=',start, ',end=',end);
								//magicSource.overwrite(start, end, generatedCode);
								magicSource.overwrite(start, start+firstLine0.length, firstLine);
								//ts.setTextRange(updateBinaryExpression, node);
								isModified = true;
								return updateBinaryExpression;
							}
						}
						// 繰り返し構文の検知と書き換え
						if (
							ts.isForStatement(node) ||
							ts.isForInStatement(node) ||
							ts.isForOfStatement(node) ||
							ts.isWhileStatement(node) ||
							ts.isDoStatement(node)
						) {
							if (hasSkipComment(node, rootSourcefile)) {
								return ts.visitEachChild(node, (n) => visitor(n, false), context);
							}
							// const fileName = node.getSourceFile().fileName;
							// console.log('fileName[3]=', fileName);
							// if(fileName.includes('/lib/')){
							// 	console.log('fileName=',node.getSourceFile().fileName);
							// 	return ts.visitEachChild(node, (n) => visit(n, false), context);
							// }
							const [change, loopNewStatement] = loopChange(id, node, visitor, inLoop, codeGenerater, magicSourceOverwrite);
							if(change) {
								const generatedCode = printer.printNode(ts.EmitHint.Unspecified, loopNewStatement, sourceFile);
								console.log('generatedCode[c]=', generatedCode)
								const start = node.getStart(sourceFile);
								const end = node.end;
								magicSource.overwrite(start, end, generatedCode);
								//ts.setTextRange(loopNewStatement, node);
								isModified = true;
								return loopNewStatement;
							}
						}
						// ループ内の if 文の検知
						// ループの中にある if文(thenブロック、elseブロック)にて
						// continue, break文があれば、yieldを付けてブロックを更新する
						if (inLoop && ts.isIfStatement(node)) {
							const _node = node as ts.IfStatement;
							const [changeThen , newThen] = transformIfBody(_node.thenStatement, (n) => visitor(n, true), magicSourceOverwrite);
							const [changeElse, newElse] = _node.elseStatement ? transformIfBody(_node.elseStatement, (n) => visitor(n, true), magicSourceOverwrite) : [false, undefined];
							const ifStatement = ts.factory.updateIfStatement(node, _node.expression, newThen, newElse);
							ts.setTextRange(ifStatement, node);
							isModified = true;
							return ifStatement;
						}


						// await をつける	
						if (ts.isCallExpression(node)) {
							const needsAwait: boolean = isAwaitAddTransformerVist(node, typeChecker, awaitTargetList);
							if( needsAwait ) {
								const awaitNode = ts.factory.createAwaitExpression( node ) ;
								// 置換前のオリジナルノード（node）の開始・終了位置を、新ノードに100%引き継ぎます
								//ts.setTextRange(awaitNode, node);
								const generatedCode0 = printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
								console.log('generatedCode[d0]=', generatedCode0)
								const generatedCode = printer.printNode(ts.EmitHint.Unspecified, awaitNode, sourceFile);
								console.log('generatedCode[d]=', generatedCode)
								const start = node.getStart(sourceFile);
								const end = node.end;
								magicSource.overwrite(start, end, generatedCode);
								isModified = true;
								return awaitNode;
							}
						}
	            		return ts.visitEachChild(node, visitor, context);
					};
					return ts.visitEachChild(rootSourcefile, visitor, context);
				};
			};
			ts.transform(sourceFile, [transformerFactory]);
			if(!isModified){
				return null;
			}
			console.log('id=',id);
      		return {
        		code: magicSource.toString(),
        		map: magicSource.generateMap({
					source: id, // < === ブラウザF12(source):置換後コードと同じ階層に表示される
					//source: `virtual-original:///${id.replace(/^\//, "")}`,
					file: id,
					includeContent: true,
					hires: true
				})
      		};		
		}
	}
}

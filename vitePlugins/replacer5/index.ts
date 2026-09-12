import * as ts from 'typescript';
import type { Plugin } from 'vite';
import * as path from 'path';
import remapping from '@ampproject/remapping'
import { Project, VariableDeclaration } from 'ts-morph';
import { isTargetEventAssignment, hasSkipComment } from '../vite-plugin-ts-code-replacer/utils/plugins-helpers.ts';

import { isAwaitAddTransformerVist, getAwaitTargets, changeAsyncFunction, directAsyncFunction, loopChange, transformObject, transformIfBody } from './helper.ts';

export function vitePluginAutoAwait(): Plugin {
	let program: ts.Program | null = null;
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
			}
			//compilerOptions.experimentalDecorators = false;
			configFileNames = configParseResult.fileNames;

	      	// プロジェクト全体のファイルを最初からすべて含んだ Program を作成
    	  	program = ts.createProgram(configParseResult.fileNames, compilerOptions);
    	},
		buildEnd() {
			targetVariableNames.clear();
			inMemoryCache.clear();
			program = null;
		},
	    transform(code, id) {
    		// node_modules やに対象外のファイルはスルー
    		if (!id.endsWith('.ts') && !id.endsWith('.tsx') || id.includes('node_modules')) return null;
    		if (!id.includes('testV2')) return null; // testV2 のときだけ実行する
    		if (!program) return null;
			//const typeChecker = program.getTypeChecker();



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
			const currentSourceFile = program.getSourceFile(normalizedId);
			if (!currentSourceFile) return null;

	      	let isModified = false;

			
			const mainTransformer = (context: ts.TransformationContext) => {
				//console.log('awaitAddTransformer[1]')
    	    	return (rootNode: ts.SourceFile) => {

					function preScan(node: ts.Node): void {
						targetVariableNames.clear();
						if (isTargetEventAssignment(node)) {
							const binaryExpr = node as ts.BinaryExpression;
							if (ts.isIdentifier(binaryExpr.right)) {
								targetVariableNames.add(binaryExpr.right.text);
							}
						}
						ts.forEachChild(node, preScan);
					}
					preScan(rootNode);

        	  		function visit(node: ts.Node, inLoop = false): ts.Node {
						// 変数定義されたメソッドを async function*() 化する
						if (ts.isVariableDeclaration(node) && node.initializer && ts.isFunctionExpression(node.initializer)) {
							if (ts.isIdentifier(node.name) && targetVariableNames.has(node.name.text)) {
								const [change, variableNode] = changeAsyncFunction(node, visit, inLoop);
    	    	            	if(change){
									return variableNode;
								}
    	            		}
        	      		}
						// 直接のイベント代入の検知と変換
            			if (isTargetEventAssignment(node)) {
							const [change, updateBinaryExpression] = directAsyncFunction(node, visit, inLoop);
							if(change){
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
    	            		if (hasSkipComment(node, rootNode)) {
        	            		return ts.visitEachChild(node, (n) => visit(n, false), context);
            	    		}
							const fileName = node.getSourceFile().fileName;
							console.log('fileName[3]=', fileName);
							if(fileName.includes('/lib/')){
								console.log('fileName=',node.getSourceFile().fileName);
								return ts.visitEachChild(node, (n) => visit(n, false), context);
							}
							const [change, loopNewStatement] = loopChange(id, node, visit, inLoop);
			                if(change) {
								return loopNewStatement;
							}							
            			}

			            // ループ内の if 文の検知
						// ループの中にある if文(thenブロック、elseブロック)にて
						// continue, break文があれば、yieldを付けてブロックを更新する
    	    		    if (inLoop && ts.isIfStatement(node)) {
        	        		const _node = node as ts.IfStatement;
		    	            const newThen = transformIfBody(_node.thenStatement, (n) => visit(n, true));
							if( _node.elseStatement) {
	        			        const newElse = transformIfBody(_node.elseStatement, (n) => visit(n, true));
    	            			const ifStatement = ts.factory.updateIfStatement(node, _node.expression, newThen[1], newElse[1]);
								return ifStatement;
							}else{
    	            			const ifStatement = ts.factory.updateIfStatement(node, _node.expression, newThen[1], undefined);
								return ifStatement;
							}
						}				
			            return ts.visitEachChild(node, visit, context);
					}
					return ts.visitNode(rootNode, visit) as ts.SourceFile;
				}
			};

			// firstStep
			const transpileResult = ts.transpileModule(code, {
				compilerOptions: compilerOptions,
				fileName: id,
				transformers: {
                        before: [
                            (context) => mainTransformer(context)
                        ]
                    }
			});

			const transformObjectResult = transformObject(transpileResult.outputText, id, program);

			if (transpileResult.sourceMapText && transformObjectResult.map) {
				// TypeScriptが生成したマップをオブジェクトに変換
				const map1 = JSON.parse(transpileResult.sourceMapText);
				// MagicStringが生成したマップ
				const map2 = transformObjectResult.map;
				// 2つを結合（最新のmap2から、過去のmap1へと遡るツリーを作る)
				const mergedMap = remapping(
                        [map2, map1],
                        () => null
                    );
				return {
					code: transformObjectResult.code,
					map: mergedMap,
				}
			}
      		return {
        		code: transformObjectResult.code,
        		map: transformObjectResult.map? transformObjectResult.map: null,
      		};		
		}
	}
}

// FEATURES
// 
// (1) replacer/awaitTargets.json
//  awaitをつけたい メソッド名を入れておく
// (2) メソッドJSDOCにマーク
//   JSDOCに @needsAwait　があるメソッドを必要条件とする
// (3) async function* にする対象
//   const loop01 = function() {  };
//   xxx.Thread.func = loop01;
//   スコープの考慮をしていない簡易解析版なので、使用時には注意すること
//   
 
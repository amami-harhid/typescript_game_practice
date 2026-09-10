import * as ts from 'typescript';
import type { Plugin } from 'vite';
import * as path from 'path';
import { Project, VariableDeclaration } from 'ts-morph';
import { isTargetEventAssignment, hasSkipComment } from '../vite-plugin-ts-code-replacer/utils/plugins-helpers.ts';
import { convertToAsyncGenerator, transformIfBody, transformLoopBody } from '../vite-plugin-ts-code-replacer/transformers/transformer.ts';

import { isAwaitAddTransformerVist, getAwaitTargets, changeAsyncFunction, directAsyncFunction, loopChange } from './helper.ts';

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

			// 2. 現在ファイルの内容で SourceFile オブジェクトをパース
			// 💡 JSDoc を解析に含めるため、明示的に ts.createSourceFile を使用する
			const sourceFile = ts.createSourceFile(
        		id,
		        code,
        		ts.ScriptTarget.Latest,
        		true, // setParentNodes: 必須
        		ts.ScriptKind.TS
    		);
			let jsDocComment: string | undefined = undefined;

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
      		//const typeChecker = program.getTypeChecker();
			const currentSourceFile = program.getSourceFile(normalizedId);
			if (!currentSourceFile) return null;

	      	let isModified = false;

			const visitor = (node: ts.Node): ts.Node => {
						if (ts.isCallExpression(node)) {
							const needsAwait: boolean = isAwaitAddTransformerVist(node, typeChecker, awaitTargetList);
							if( needsAwait ) {
								const awaitNode = ts.factory.createAwaitExpression( node ) ;
								//const awaitNode = ts.factory.createAwaitExpression(ts.visitEachChild(node, visit, context)) ;
								// 置換前のオリジナルノード（node）の開始・終了位置を、新ノードに100%引き継ぎます
								ts.setTextRange(awaitNode, node);
								isModified = true;
								return awaitNode;
							}
						}
			            return ts.visitEachChild(node, visitor, context);

			}
			const mainTransformer = (context: ts.TransformationContext) => {
				//console.log('awaitAddTransformer[1]')
    	    	return (rootNode: ts.SourceFile) => {

        	  		function visit(node: ts.Node, inLoop = false): ts.Node {
						// 💡 呼び出し式の末尾の識別子（waitなど）に絞り込んで Symbol を取得
						//console.log('awaitAddTransformer[2]')
						if (ts.isCallExpression(node)) {
							const needsAwait: boolean = isAwaitAddTransformerVist(node, typeChecker, awaitTargetList);
							if( needsAwait ) {
								const awaitNode = ts.factory.createAwaitExpression( node ) ;
								//const awaitNode = ts.factory.createAwaitExpression(ts.visitEachChild(node, visit, context)) ;
								// 置換前のオリジナルノード（node）の開始・終了位置を、新ノードに100%引き継ぎます
								ts.setTextRange(awaitNode, node);
								isModified = true;
								return awaitNode;
							}
						}
			            return ts.visitEachChild(node, visit, context);
					}
					return ts.visitNode(rootNode, visit) as ts.SourceFile;
				}
			};
			//console.log('==========[001]============')

			// 擬似的なトランスフォームコンテキストの作成、または ts.transform の実行
      		const context = {
        		getCompilerOptions: () => program!.getCompilerOptions(),
        hoistFunctionDeclaration: () => {},
        hoistVariableDeclaration: () => {},
        readEmitHelpers: () => undefined,
        requestEmitHelper: () => {},
        resumeLexicalEnvironment: () => {},
        startLexicalEnvironment: () => {},
        		endLexicalEnvironment: () => undefined,
      		};
			const transformedSource = ts.visitNode(sourceFile, visitor) as ts.SourceFile;
			const printer = ts.createPrinter({ removeComments: false });
			const outputText = printer.printFile(transformedSource);

      		return {
        		code: outputText,
        		map: null
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
 
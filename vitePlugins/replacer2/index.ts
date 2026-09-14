import * as ts from 'typescript';
import type { Plugin } from 'vite';
import * as path from 'path';
import remapping from '@ampproject/remapping';

import * as helper from './helper.ts';
import * as helperMS from './helperMS.ts';
import * as helperAG from './helperAsyncGenerator.ts'
import { CodeBlockWriter } from 'ts-morph';

export function vitePluginAutoAwait(): Plugin {
	let program: ts.Program | null = null;
	const inMemoryCache = new Map<string, string>();
	let compilerOptions: ts.CompilerOptions = {};
	let configFileNames: string[] = [];
	return {
		name: 'vite-plugin-auto-await',
    	enforce: 'pre',
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
			inMemoryCache.clear();
			program = null;
		},
	    transform(code, id) {
    		// node_modules やに対象外のファイルはスルー
			if( helper.isTargetIdExcluded(id)) {
				return null;
			}
    		if (!program) return null;

			// HMR（ファイルの書き換え）対応：必要に応じてプログラムを再作成
			const normalizedId = path.normalize(id).replace(/\\/g, '/');
			// 【インメモリ】Viteが検知した「エディタからの最新コード」をインメモリに即時上書き保存
    		inMemoryCache.set(normalizedId, code);
			// 【インメモリ】ファイル読み込みをインターセプトするカスタムホストを作成
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
			// 最新の変更状態を反映した状態で Program と TypeChecker をビルドする
    		// これを挟まないと、何回保存しても初期状態のコードがトランスフォームされ続けます
    		program = ts.createProgram([...configFileNames, normalizedId], compilerOptions, customHost);
			const currentSourceFile = program.getSourceFile(normalizedId);
			if (!currentSourceFile) return null;

			const loopYieldTransformer = (context: ts.TransformationContext) => {
    	    	return (rootNode: ts.SourceFile) => {

					function visit(node: ts.Node, inLoop = false): ts.Node {
						// 繰り返し構文の検知と書き換え
	            		if (
    	            		ts.isForStatement(node) ||
        	        		ts.isForInStatement(node) ||
            	    		ts.isForOfStatement(node) ||
                			ts.isWhileStatement(node) ||
                			ts.isDoStatement(node)
	            		) {
    	            		if (helper.hasSkipComment(node, rootNode)) {
        	            		return ts.visitEachChild(node, (n) => visit(n, false), context);
            	    		}
							const filePath = node.getSourceFile().fileName;
							//console.log('filePath[3]=', filePath);
							if(helper.isYieldExcluded(filePath)){
								//console.log('fileName=',node.getSourceFile().fileName);
								return ts.visitEachChild(node, (n) => visit(n, false), context);
							}
							const [change, loopNewStatement] = helper.loopChange(id, node, visit, inLoop);
			                if(change) {
								return loopNewStatement;
							}							
            			}

			            // ループ内の if 文の検知
						// ループの中にある if文(thenブロック、elseブロック)にて
						// continue, break文があれば、yieldを付けてブロックを更新する
    	    		    if (inLoop && ts.isIfStatement(node)) {
        	        		const _node = node as ts.IfStatement;
		    	            const newThen = helper.transformIfBody(_node.thenStatement, (n) => visit(n, true));
							if( _node.elseStatement) {
	        			        const newElse = helper.transformIfBody(_node.elseStatement, (n) => visit(n, true));
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

			// ステップ１
			// async generator化
			const asyncGeneratorTransformResult = helperAG.transformAGObject(code,id);

			// ステップ２
			// await 追加( + 必要に応じて親メソッド定義を async にする)
			// (magicStringを使う)
			const awaitTransformResult = helperMS.transformObject(asyncGeneratorTransformResult.code, id);
			// ステップ３
			// 繰り返しループの中に yieldをつける ( + 必要に応じて親メソッドを Generator関数にする )
			// Typescriptの公式変換( 型情報は消えて、Javascript になる )
			const loopYieldTranspileResult = ts.transpileModule(awaitTransformResult.code, {
				compilerOptions: compilerOptions,
				fileName: id,
				transformers: {
					// 【before】
					// TypeScript 本来の構文変換の前に
					// 自作の変換処理（トランスフォーマー）
					// を実行させる
                	before: [
                        (context) => loopYieldTransformer(context)
                    ]
                }
			});
			const finalCode = loopYieldTranspileResult.outputText;
			const map1 = asyncGeneratorTransformResult.map;
			const map2 = awaitTransformResult.map;
			// TypeScriptが生成したマップをオブジェクトに変換
			const map3Text = loopYieldTranspileResult.sourceMapText;
			const map3 = (map3Text)? JSON.parse(map3Text): {};
			const mergedMap = remapping(
                        [map3, map2, map1],
                        () => null
                    );
			// 元コードを格納: F12 sourceで元コードを表示するため
			mergedMap.sourcesContent = [code]; 
			return {
				code: finalCode, 
				map: mergedMap as any,
			}
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
 
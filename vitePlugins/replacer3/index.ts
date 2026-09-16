import * as ts from 'typescript';
import type { Plugin } from 'vite';
import * as path from 'path';
import remapping from '@ampproject/remapping';

import * as helper from './helper.ts';
import * as helperMS from './helperMS.ts';
import * as helperAG from './helperAsyncGenerator.ts'
import { CodeBlockWriter, InMemoryFileSystemHost } from 'ts-morph';
import * as fs from "fs"; // 実ファイル読み込み用
import { Project } from 'ts-morph';
import { CustomFileSystemHost } from './customFileSystem.ts';
import * as Cache from './memoryCache.ts'

// パスの正規化関数
const normalizePath = (p: string) => path.normalize(p).replace(/\\/g, "/");

export function vitePluginAutoAwait(): Plugin {
	//let program: ts.Program | null = null;
	//const inMemoryCache = new Map<string, string>();
	let compilerOptions: ts.CompilerOptions = {};
	let configFileNames: string[] = [];
	return {
		name: 'vite-plugin-auto-await',
    	enforce: 'pre',
		// メモリキャッシュに最新の修正コードがあればそれを返す仕組み
		load(id) {
			const normId = id.split('?')[0];
			if(Cache.MemoryCache.has(id)){
				return Cache.MemoryCache.get(id);
			}
			return null;
		},
		handleHotUpdate(ctx){
			// 保存されたファイルの絶対パスを正規化
			// const fileName = ctx.file;
			// if(helper.MemoryCache.has(fileName)){
			// 	helper.MemoryCache.remove(fileName);
			// }
			Cache.MemoryCache.clear();
			// 何も返さない（void）、または ctx.modules を返すと通常のHMRフローが継続します
			return ctx.modules;
		},
    	// 💡 プロジェクト起動時に tsconfig.json を読み込んで、型環境を完全に構築する
    	buildStart() {
			//helper.MemoryCache.clear();
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
        		sourceMap: true,       // これにより、emit時に元の位置に紐づくマップが自動生成されます
        		inlineSources: true,   // 元のコードをマップに含める
				//noEmit : false,
				//emitDeclarationOnly: true,
				//experimentalDecorators: true,
			}
			//compilerOptions.experimentalDecorators = false;
			configFileNames = configParseResult.fileNames;

	      	// プロジェクト全体のファイルを最初からすべて含んだ Program を作成
    	  	//program = ts.createProgram(configParseResult.fileNames, compilerOptions);
    	},
		buildEnd() {
			//helper.MemoryCache.clear();
			//program = null;
		},
	    transform(code, id) {
			const [cleanId] = id.split('?');
			const normId = normalizePath(cleanId); // ← ここで定義しています

    		// node_modules やに対象外のファイルはスルー
			if( helper.isTargetIdExcluded(cleanId)) {
				//console.log('Id excluded = ', _id)
				return null;
			}

			// 2. ts-morph の公式インメモリファイルシステムを使用（型エラーを回避）
      		//const memFS = new InMemoryFileSystemHost();

			// HMR（ファイルの書き換え）対応：必要に応じてプログラムを再作成
			const normalizedId = path.normalize(id).replace(/\\/g, '/');
			// 【インメモリ】Viteが検知した「エディタからの最新コード」をインメモリに即時上書き保存
			if(id == 'D:/Scratch3/ts/typescript_game_practice/src/testV2/010/sub/threads.ts'){
				console.log('==== In tranform helper.MemoryCache.set normalizedId=', normalizedId);
			}
			//helper.MemoryCache.set(id, code, false);
			//inMemoryCache.set(normalizedId, code);

			const customFileSystem = new CustomFileSystemHost(normId, code);

			// 3. 型を満たしたカスタムオブジェクトを Project に渡す
      		const project = new Project({
        		tsConfigFilePath: path.resolve(process.cwd(), "tsconfig.json"),
        		fileSystem: customFileSystem // これで型エラーが解消されます
    		});
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
			//console.log('===== STEP01')
			//if(!program) return null;
			const asyncGeneratorTransformResult = helperAG.transformAGObject(code,id, project);
			if(id == 'D:/Scratch3/ts/typescript_game_practice/src/testV2/010/sub/threads.ts'){
				console.log('==== code[1]=\n', asyncGeneratorTransformResult.code);
			}
			// ステップ２
			// await 追加( + 必要に応じて親メソッド定義を async にする)
			// (magicStringを使う)
			//console.log('===== STEP02')
			const awaitTransformResult = helperMS.transformObject(asyncGeneratorTransformResult.code, id, project);
			if(id == 'D:/Scratch3/ts/typescript_game_practice/src/testV2/010/sub/threads.ts'){
				console.log('==== code[2]=\n', awaitTransformResult.code);
			}
			// ステップ３
			// 繰り返しループの中に yieldをつける ( + 必要に応じて親メソッドを Generator関数にする )
			// Typescriptの公式変換( 型情報は消えて、Javascript になる )
			//console.log('===== STEP03')
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
			if(id == 'D:/Scratch3/ts/typescript_game_practice/src/testV2/010/sub/threads.ts'){
				console.log('==== code[3]=\n', loopYieldTranspileResult.outputText);
			}
			//console.log('===== STEP04')
			//console.log(id)
			const finalCode = loopYieldTranspileResult.outputText;
			const map1 = asyncGeneratorTransformResult.map;
			//console.log('map1 = ', map1);
			const map2 = awaitTransformResult.map;
			//console.log('map2 = ', map2);
			// TypeScriptが生成したマップをオブジェクトに変換
			const map3Text = loopYieldTranspileResult.sourceMapText;
			const map3 = (map3Text)? JSON.parse(map3Text): {};
			//console.log('map3 = ', map3);
			const mergedMap = remapping(
                        [map3, map2, map1],
                        () => null
                    );
			//console.log('===== STEP05')
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
 
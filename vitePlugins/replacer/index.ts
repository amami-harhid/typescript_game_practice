import * as ts from 'typescript';
import type { Plugin } from 'vite';
import * as path from 'path';
import remapping from '@ampproject/remapping';

import * as helper from './helper.ts';
import * as helperMS from './helperMS.ts';
import * as helperAG from './helperAsyncGenerator.ts'
import * as Cache from './memoryCache.ts';
import * as Utils from './utils.ts';
import { loopYieldTransformer } from './loopYieldTransformer.ts';

export function vitePluginAutoAwait(): Plugin {
	//let program: ts.Program | null = null;
	//const inMemoryCache = new Map<string, string>();
	let compilerOptions: ts.CompilerOptions = {};
	//let configFileNames: string[] = [];
	return {
		name: 'vite-plugin-auto-await',
    	enforce: 'pre',
		// メモリキャッシュに最新の修正コードがあればそれを返す仕組み
		load(id) {
			const normId = id.split('?')[0];
			if(Cache.MemoryCache.has(normId)){
				return Cache.MemoryCache.get(normId);
			}
			return null;
		},
		hotUpdate(ctx) {
			// Vite 8では、ブラウザ用のコードを処理する client 環境 と、サーバーサイド（SSRやVite自体の処理）用の
			// コードを処理する ssr 環境 など、複数の環境が並行して動いている。
			// そのため、1回の保存に対して「client 環境用」と「ssr 環境用」の2回、フックがトリガーされる
			// client 環境の時だけ処理を行うとする（ssr などの時はスキップ）
			if (this.environment.name !== 'client') {
				return;
			}
			// Viteは開発スピードを極限まで上げるために
			//「変更されたファイルだけをピンポイントで処理する」という強力なキャッシュ機構を持っています。
			// しかし「保存されていない他のファイル」を起因としたコード置換をしている場合、ホットリロード時に
			// 他ファイルを処理しないため、他ファイル起因のコード置換が行われません。
			// ここではその回避のために、Viteのモジュールグラフを探索することで、更新保存されたTSファイルを
			// インポート(直接的・間接的)する親ファイルを探し出しています。
			// 親ファイルのキャッシュ情報を破棄することで、必要な全てのコード置換を発生させています。
			const fileName = ctx.file;
			if(fileName.endsWith(".ts")){
				//console.log('hotUpdate ==> full-reload')
				Cache.MemoryCache.clear();
				const { moduleGraph } = this.environment;
				// 更新保存されたモジュール情報を取得
				const threadMods = moduleGraph.getModulesByFile(ctx.file);
				if (threadMods) {
					const invalidated = new Set<any>();
					// インポートしている親、そのまた親... を再帰的に探す関数
					const invalidateImporters = (mod: any) => {
						if (!mod || invalidated.has(mod)) return;
						invalidated.add(mod);
						// キャッシュを破棄
						moduleGraph.invalidateModule(mod);
						// このモジュールをインポートしている親たち（importers）に対して再帰処理
						for (const parent of mod.importers) {
							invalidateImporters(parent);
						}
					}
					for (const mod of threadMods) {
						invalidateImporters(mod);
					}
				}
				// ホットリロード（full-reload)を実行
				this.environment.hot.send({
					type: 'full-reload'
				})
				return [];
			}
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
        		sourceMap: true,       // これにより、emit時に元の位置に紐づくマップが自動生成されます
        		inlineSources: true,   // 元のコードをマップに含める
				//noEmit : false,
				//emitDeclarationOnly: true,
				//experimentalDecorators: true,
			}
			//compilerOptions.experimentalDecorators = false;
			//configFileNames = configParseResult.fileNames;

	      	// プロジェクト全体のファイルを最初からすべて含んだ Program を作成
    	  	//program = ts.createProgram(configParseResult.fileNames, compilerOptions);
    	},
		buildEnd() {
			//helper.MemoryCache.clear();
			//program = null;
		},
	    transform(code, id) {
			const [_id] = id.split('?');

    		// node_modules やに対象外のファイルはスルー
			if( helper.isTargetIdExcluded(_id)) {
				//console.log('Id excluded = ', _id)
				return null;
			}
    		//if (!program) return null;

			// HMR（ファイルの書き換え）対応：必要に応じてプログラムを再作成
			const normalizedId = Utils.normalizePath(id);
			// 【インメモリ】ファイル読み込みをインターセプトするカスタムホストを作成
    		const defaultHost = ts.createCompilerHost(compilerOptions);
			const customHost: ts.CompilerHost = {
				...defaultHost,
				// TypeScript がファイルを要求した時、メモリに最新の修正コードがあればそれをパースして返す
				getSourceFile: (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
        			if (Cache.MemoryCache.has(fileName)) {
            			return ts.createSourceFile(
            				fileName,
            				Cache.MemoryCache.get(fileName), // 最新の保存コード
            				languageVersion,
            				true // setParentNodes: true
            			);
          			}
        			return defaultHost.getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
        		},
        		fileExists: (fileName) => {
        			return Cache.MemoryCache.has(fileName) || defaultHost.fileExists(fileName);
        		}
			}
			// 最新の変更状態を反映した状態で Program と TypeChecker をビルドする
    		// これを挟まないと、何回保存しても初期状態のコードがトランスフォームされ続けます
    		//program = ts.createProgram([...configFileNames, normalizedId], compilerOptions, customHost);
			//if(!program) return null;

			//const currentSourceFile = program.getSourceFile(normalizedId);
			//if (!currentSourceFile) return null;


			// ステップ１
			// async generator化
			const asyncGeneratorTransformResult = helperAG.transformAGObject(code,_id );
			// ステップ２
			// await 追加( + 必要に応じて親メソッド定義を async にする)
			// (magicStringを使う)
			const awaitTransformResult = helperMS.transformObject(asyncGeneratorTransformResult.code, _id);
			// ステップ３
			// 繰り返しループの中に yieldをつける ( + 必要に応じて親メソッドを Generator関数にする )
			// Typescriptの公式変換( 型情報は消えて、Javascript になる )
			const loopYieldTranspileResult = ts.transpileModule(awaitTransformResult.code, {
				compilerOptions: compilerOptions,
				fileName: _id,
				transformers: {
					// 【before】
					// TypeScript 本来の構文変換の前に
					// 自作の変換処理（トランスフォーマー）を実行させる
                	before: [
                        (context) => loopYieldTransformer(id, context)
                    ]
                }
			});

			// 元ファイルへ空行を追加したとき無視されないように、現在時刻を末尾行に追加する
			const timestamp = Date.now();
			const finalCode = loopYieldTranspileResult.outputText + `\n// _hmr_refresh_anchor_: ${timestamp}`;

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
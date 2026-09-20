import * as ts from 'typescript';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import * as path from 'path';
import remapping from '@ampproject/remapping';

import * as Cache from './memoryCache.ts';
import * as Helper from './helper.ts';
import * as AsyncGenerator from './transform/asyncGenerator/transformer.ts'
import * as Await from './transform/await/transformer.ts';
import * as LoopYield from './transform/loopYield/transformer.ts';


export function vitePluginAutoReplacer(
	tagMarks: Helper.TagMarks, 
	targetThreadSetter: Helper.TargetThreadSetter,
	tagAwait: Helper.TagAwait
): Plugin {
	
	// 渡されたJSONデータを保存する。
	Helper.jsonDataObj.tagMarks = tagMarks;
	Helper.jsonDataObj.targetThreadSetter = targetThreadSetter;
	Helper.jsonDataObj.tagAwait = tagAwait;

	// Regex 生成 ( ThreadSetter )
	if(targetThreadSetter.targetsRegExp){
		for(const targetRegExp of targetThreadSetter.targetsRegExp){
			const regexp = new RegExp(targetRegExp.pattern);
			Helper.regexpObj.regexThreadSetter.push( regexp );
		}
	}
	// Regex 生成 ( Await )
	if(tagAwait.targetsRegExp) {
		for(const targetRegExp of tagAwait.targetsRegExp){
			const regexp = new RegExp(targetRegExp.pattern);
			Helper.regexpObj.regexAwait.push( regexp );
		}
	}

	let compilerOptions: ts.CompilerOptions = {};

	return {
		name: 'vite-plugin-auto-replacing',
    	enforce: 'pre',
		// メモリキャッシュに最新の修正コードがあればそれを返す仕組み
		load(id) {
			const normId = id.split('?')[0];
			if(Cache.MemoryCache.has(normId)){
				return Cache.MemoryCache.get(normId);
			}
			return null;
		},
		// 開発サーバーのインスタンスを保持する
    	configureServer(_server) {
			Helper.ServerObj.server = _server;
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
		// Viteの設定が確定したタイミングで呼び出されるフック
		configResolved(config: ResolvedConfig) {
			Helper.ViteConfigObj.viteConfig = config;
		},
    	// プロジェクト起動時に tsconfig.json を読み込んで、型環境を完全に構築する
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
        		sourceMap: true,       // これにより、emit時に元の位置に紐づくマップが自動生成されます
        		inlineSources: true,   // 元のコードをマップに含める
			}

			// エラーオーバーレイキャッシュをクリア
			Helper.lastErrorOverlayCache.clear();
			

		},
	    transform(code, id) {
			const [_id] = id.split('?');
			
    		// node_modules やに対象外のファイルはスルー
			if( Helper.isTargetIdExcluded(_id)) {
				return null;
			}
			
			// ステップ１
			// async generator化
			const asyncGeneratorTransformResult = AsyncGenerator.transform(code,_id);
			
			if(asyncGeneratorTransformResult.forceError === true) {
				return { code: '', map: null};
			}
			// ステップ２
			// await 追加( + 必要に応じて親メソッド定義を async にする)
			// (magicStringを使う)
			const awaitTransformResult = Await.transform(asyncGeneratorTransformResult.code, _id);
			
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
                        (context) => LoopYield.transform(id, context)
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
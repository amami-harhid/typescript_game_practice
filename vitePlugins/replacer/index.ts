import * as ts from 'typescript';
import type { Plugin, ViteDevServer  } from 'vite';
import * as path from 'path';
import remapping from '@ampproject/remapping';
import fs from 'fs'; 

import * as helper from './helper.ts';
import * as helperAwait from './helperAwaitTransformer.ts';
import * as helperAsyncGenerator from './helperAsyncGenerator.ts'
import * as Cache from './memoryCache.ts';
import { loopYieldTransformer } from './loopYieldTransformer.ts';

export function vitePluginAutoAwait(): Plugin {
	let compilerOptions: ts.CompilerOptions = {};
	let server: ViteDevServer | null = null;
	/** ファイルパスごとの最終エラー時刻を記録するMap */
	const lastErrorCache = new Map<string, number>();
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
    		server = _server;
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
    	},
	    transform(code, id) {
			const [_id] = id.split('?');
			/** 
			 * キャッシュを強制クリアするヘルパー関数
			 * TSコードを修正保存するときホットリロードされるが
			 * 関連するファイル全てについて置換処理（１段目、２段目、３段目）のやり直しを
			 * させたい。エラー発生したときにはキャッシュ強制クリアをペアで行うものとする
			 */ 
			const clearCache: helper.ClearCache = () => {
        		if (server) {
          			const moduleNode = server.moduleGraph.getModuleById(id);
          			if (moduleNode) {
            			// モジュールグラフからこのファイルのキャッシュを無効化
            			server.moduleGraph.invalidateModule(moduleNode);
          			}
        		}
			}
			/**
			 * エラー発生時のラッパー関数
			 * Viteの開発サーバー（HMR）の二重ロード仕様によるエラーメッセージ２重呼出しを回避させる意図で
			 * 用意したエラーラッパー関数です。
			 * 
			 * 開発時には「プリトランスパイル（Pre-transform）」と
			 * 「実際のモジュール構築（Internal server/Bundle）」の２つのフェーズで
			 * transformフックが呼び出されます。
			 * そのため、２回連続でエラーが起こることになり少々目障り感があります。
			 * 短い間隔でエラーが起きる場合は、２回目のエラー表示を無視するようにします。
			 */ 
    	  	const emitErrorWrapper: helper.EmitErrorWrapper = (errObj: helper.ErrorObj) => {

				if(errObj.isAnotherFile && errObj.isAnotherFile === true){
					emitErrorServer(errObj);
					return;
				}

				//console.log('Sending error for:', errObj.id)
				const errorTargetId = errObj.id;
				const now = Date.now();
				const lastErrorTime = lastErrorCache.get(errorTargetId) || 0;
				// 前回のエラーから 500ms 以内の場合は、Viteの重複リクエストとみなして処理をスルーする
				if (now - lastErrorTime < 500) {
					// すでに1回目でブラウザにエラーは送られているため
					// 2回目はビルドをクラッシュさせずに静かにプロセスを終了させます
					return
				}
				clearCache();// エラー時には、キャッシュ強制クリアが必須です
				// タイムスタンプを更新
				lastErrorCache.set(errorTargetId, now);
				// 本物の Vite エラーを実行
				//console.log('error reached')
				this.error(errObj);
    		};
    	  	const emitErrorServer: helper.EmitErrorWrapper = (errObj: helper.ErrorObj) => {

				//console.log('Sending error for:', errObj.id)
				const errorTargetId = errObj.id;
				const now = Date.now();
				const lastErrorTime = lastErrorCache.get(errorTargetId) || 0;
				// 前回のエラーから 500ms 以内の場合は、Viteの重複リクエストとみなして処理をスルーする
				if (now - lastErrorTime < 500) {
					// すでに1回目でブラウザにエラーは送られているため
					// 2回目はビルドをクラッシュさせずに静かにプロセスを終了させます
					//throw new Error('VITE_PLUGIN_HANDLED_ERROR');
					return;
				}
				clearCache();// エラー時には、キャッシュ強制クリアが必須です
				// タイムスタンプを更新
				lastErrorCache.set(errorTargetId, now);

				if(server) {
					// 🌟 ws.send('error') を使う場合、画面にコードスニペットを出すには「生のファイルコード」を frame に載せる必要があります
					let fileContent = '';
					try{
						fileContent = fs.readFileSync(errObj.id, 'utf-8');
					}catch (e) {
						fileContent = code; // 読み込めなければ現在のコードで代用
					}
					// Viteのクライアントへ直接エラーイベントを発火（Viteがパスを上書きするのを防ぐ）
					server.ws.send({
						type: 'error',
						err: {
							message: errObj.message,
							plugin: 'vite-plugin-auto-replacing',
							id: errObj.id, // 🌟 これで別ファイルの絶対パスがそのまま届く
							loc: errObj.loc,
							// 🌟 stack プロパティが必須なので、簡易的なトレース文字列を生成して渡す
							stack: `Error: ${errObj.message}\n    at ${errObj.id}:${errObj.loc.line}:${errObj.loc.column}`,
							// エラー箇所の周辺コードスニペットを組み立てて渡す（ViteのError Overlay用）
							frame: generateCodeFrame(fileContent, errObj.loc.line, errObj.loc.column)
						}
					} as any);
				}

				// 本物の Vite エラーを実行
				//console.log('error reached')
				//this.error(errObj);
    		};
			const generateCodeFrame = (code: string, line: number, column: number): string => {
				const lines = code.split('\n');
				const start = Math.max(0, line - 3);
				const end = Math.min(lines.length, line + 3);
				return lines.slice(start, end).map((l, i) => {
    				const currentLineNum = start + i + 1;
    				const isTarget = currentLineNum === line;
    				const prefix = isTarget ? `> ${currentLineNum} | ` : `  ${currentLineNum} | `;
    				const pointer = isTarget ? `\n    | ${' '.repeat(column - 1)}^` : '';
    				return `${prefix}${l}${pointer}`;
				}).join('\n');
			}
    		// node_modules やに対象外のファイルはスルー
			if( helper.isTargetIdExcluded(_id)) {
				return null;
			}
			// this(TransformPluginContext)配下とする
			const emitError = emitErrorWrapper.bind(this);
			// ステップ１
			// async generator化
			const asyncGeneratorTransformResult = helperAsyncGenerator.asyncGeneratorTransformer(code,_id, emitError);
			//console.log('asyncGeneratorTransformResult##################')
			//console.log(asyncGeneratorTransformResult.code)
			
			if(asyncGeneratorTransformResult.forceError === true) {
				return { code: '', map: null};
			}
			// ステップ２
			// await 追加( + 必要に応じて親メソッド定義を async にする)
			// (magicStringを使う)
			const awaitTransformResult = helperAwait.awaitTransformer(asyncGeneratorTransformResult.code, _id, emitError);
			//console.log('awaitTransformResult##################')
			//console.log(awaitTransformResult.code)
			
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
                        (context) => loopYieldTransformer(id, context, emitError)
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
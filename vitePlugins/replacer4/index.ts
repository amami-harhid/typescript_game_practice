import * as ts from 'typescript';
import type { Plugin } from 'vite';
import * as path from 'path';
import { GenMapping, addMapping, toEncodedMap } from '@jridgewell/gen-mapping';
import MagicString from "magic-string";

import { isAwaitAddTransformerVist, getAwaitTargets, directAsyncFunction, loopChange, changeAsyncFunction, isTargetEventAssignment, transformIfBody } from './helper.ts';

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

    	},
		buildEnd() {
			//targetVariableNames.clear();
			inMemoryCache.clear();
			program = null;
		},
	  transform(code: string, id: string) {
        const printer = ts.createPrinter({ removeComments: false });
      // .ts または .tsx ファイル以外はスキップ
      if (!id.match(/\.tsx?$/)) return;

      // let outputCode = '';
      // let sourceMap = '';

      // 1. コンパイラオプションの設定
      const compilerOptions: ts.CompilerOptions = {
        target: ts.ScriptTarget.Latest,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.React, // TSXも考慮
        sourceMap: true,       // ソースマップを有効化
        inlineSources: true, 
        noEmitOnError: false,  // 【重要】型エラーがあっても強制出力
        skipLibCheck: true,    // 型定義チェックをスキップして高速化
      };

      // // 2. インメモリ用のカスタムホストを作成
      // const host = ts.createCompilerHost(compilerOptions);
      
      // // 元のソースファイルを読み込ませず、Viteから渡された現在のコードを使用する
      // host.getSourceFile = (fileName, languageVersion) => {
      //   console.log('getSourceFile fileName=', fileName)
      //   if (fileName === id) {
      //     return ts.createSourceFile(id, code, languageVersion, true);
      //   }
      //   // 周辺ファイルの参照（インポート等）でエラーにならないよう空のファイルを返す
      //   return ts.createSourceFile(fileName, '', languageVersion, true);
      // };

      // // 3. 【最重要】出力を横取りするフック
      // host.writeFile = (fileName, text) => {
      //   //console.log(`★ writeFile が呼ばれました: ${fileName}`); // デバッグ用ログ
      //   if (fileName.endsWith('.ts') || fileName.endsWith('.js') || fileName.endsWith('.jsx')) {
      //     outputCode = text;
      //   } else if (fileName.endsWith('.js.map')) {
      //     sourceMap = text;
      //   }
      // };
	      	// プロジェクト全体のファイルを最初からすべて含んだ Program を作成
    	  	program = ts.createProgram([id], compilerOptions);
          if(!program) return;

			typeChecker = program.getTypeChecker();
        const sourceFile = program.getSourceFile(id);
        if(!sourceFile) return;

      // マップ生成器の初期化
      const map = new GenMapping({ file: id });
  
      // 4. Transformer（置換処理）の定義
      const transformerFactory: ts.TransformerFactory<ts.SourceFile> = (context) => {
        //console.log('transformerFactory');
        return (rootNode) => {
          const visit = (node: ts.Node, inLoop: boolean = false): ts.Node => {
            //console.log('visit');
            // 直接のイベント代入の検知と変換
				    if (isTargetEventAssignment(node)) {
					    const [change, updateBinaryExpression] = directAsyncFunction(node, visit, inLoop);
					    if(change){
                console.log('直接のイベント代入の検知と変換 change = ', change)
                const generatedCode = printer.printNode(ts.EmitHint.Unspecified, updateBinaryExpression, sourceFile);
                console.log('直接のイベント代入の検知と変換 generatedCode=', generatedCode)
                // 元のコード上での行と列を取得
                const originalLoc = sourceFile.getLineAndCharacterOfPosition(node.getStart());

                // addMapping(map, {
                //   generated: { 
                //     line: originalLoc.line,      // 本来は正確な出力行。今回は簡易的に元の行に同期
                //     column: originalLoc.character 
                //   },
                //   source: id,
                //   original: { line: originalLoc.line, column: originalLoc.character },
                // });

						    return updateBinaryExpression;
                //return ts.visitEachChild(updateBinaryExpression, visit, context);
					    }
				    }

            // ここでノードの置換処理を行う
            // 例: if (ts.isIdentifier(node) && node.text === 'foo') ...
            return ts.visitEachChild(node, visit, context);
          };
          return ts.visitNode(rootNode, visit) as ts.SourceFile;
        };
      };

          const _compilerOptions = program!.getCompilerOptions();
      const result = ts.transform(sourceFile, [transformerFactory], _compilerOptions);
      const transformedSourceFile = result.transformed[0] as ts.SourceFile;

      // 2. 公式にサポートされている SourceMapGenerator を手動で作成
          const sourceMapGenerator = (ts as any).createSourceMapGenerator(
            ts.sys,
            id,
            '.',
            '.',
            _compilerOptions
        );

      // プリンターは空のオプションで作成する
      const customPrinter = ts.createPrinter(
        { removeComments: false },
        {
        		// 🚨 変換されたノードの通知イベントをプリンターと共有します
        		onEmitNode: result.emitNodeWithNotification
    		}
      );
      const outputCode = customPrinter.printFile(transformedSourceFile);

      result.dispose();

      // 5. ジェネレーターから安全にプレーンなマップオブジェクトを回収
    		const rawMapStr = sourceMapGenerator.toJSON();
    		const mapObject = typeof rawMapStr === 'string' ? JSON.parse(rawMapStr) : JSON.parse(JSON.stringify(rawMapStr));

      // 7. Vite にコードとソースマップを返却
      const finalMap = toEncodedMap(map);

      const projectRoot = process.cwd().replace(/\\/g, '/') + '/src';
      console.log(projectRoot)
      //const _id = id.replace(/^\/src/, '');
    	let relativePath = id.replace(/\\/g, '/').replace(projectRoot, '');
    	if (!relativePath.startsWith('/')) relativePath = '/' + relativePath;

			const transformedPath = relativePath.replace(/\.tsx?$/, '.js') + '?transformed';
			//const transformedPath = relativePath + '?transformed';

      // 1. パスからファイル名だけを抽出（例: /src/components/Button.ts -> Button.ts）
      const fileName = id.split(/[/\\]/).pop() || 'index.ts';

      // 2. 【最重要】ブラウザに元コードを表示させるために、元のソースコードを丸ごと詰め込む
      mapObject.sources = [relativePath, transformedPath];          // ソースファイルのパスを配列で指定
      mapObject.sourcesContent = [code, outputCode]; // transform(code, id) で受け取った「元のコード」を入れる
      //finalMap.sources = [relativePath];          // ソースファイルのパスを配列で指定
      //finalMap.sourcesContent = [code]; // transform(code, id) で受け取った「元のコード」を入れる
      //finalMap.sourceRoot = path.dirname(id);
      const safeMap = {
                  version: mapObject.version || 3,
                  file: path.basename(id),
                  sources: mapObject.sources,
                  sourcesContent: mapObject.sourcesContent,
                  mappings: mapObject.mappings, // これで高精度な mappings が取り出せます
                  names: mapObject.names || [],
                  //ignoreList: [],
                };
      console.log(safeMap);
      // 7. Base64 形式にエンコードしてインラインソースマップとして追記
  		const mapJsonString = JSON.stringify(safeMap);
    	const base64Map = Buffer.from(mapJsonString).toString('base64');
      const sourceMappingComment = `\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64Map}`;
      return {
        code: outputCode + sourceMappingComment,
        map: safeMap as any,
      };
    }
	}
}

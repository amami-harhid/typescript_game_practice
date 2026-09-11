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
	    transform(code: string, id: string) {
      // .ts または .tsx ファイル以外はスキップ
      if (!id.match(/\.tsx?$/)) return;

      let outputCode = '';
      let sourceMap = '';

      // 1. コンパイラオプションの設定
      const compilerOptions: ts.CompilerOptions = {
        target: ts.ScriptTarget.Latest,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.React, // TSXも考慮
        sourceMap: true,       // ソースマップを有効化
        noEmitOnError: false,  // 【重要】型エラーがあっても強制出力
        skipLibCheck: true,    // 型定義チェックをスキップして高速化
      };

      // 2. インメモリ用のカスタムホストを作成
      const host = ts.createCompilerHost(compilerOptions);
      
      // 元のソースファイルを読み込ませず、Viteから渡された現在のコードを使用する
      host.getSourceFile = (fileName, languageVersion) => {
        if (fileName === id) {
          return ts.createSourceFile(id, code, languageVersion, true);
        }
        // 周辺ファイルの参照（インポート等）でエラーにならないよう空のファイルを返す
        return ts.createSourceFile(fileName, '', languageVersion, true);
      };

      // 3. 【最重要】出力を横取りするフック
      host.writeFile = (fileName, text) => {
        console.log(`★ writeFile が呼ばれました: ${fileName}`); // デバッグ用ログ
        if (fileName.endsWith('.ts') || fileName.endsWith('.js') || fileName.endsWith('.jsx')) {
          outputCode = text;
        } else if (fileName.endsWith('.js.map')) {
          sourceMap = text;
        }
      };

      // 4. Transformer（置換処理）の定義
      const transformerFactory: ts.TransformerFactory<ts.SourceFile> = (context) => {
        return (rootNode) => {
          const visit = (node: ts.Node): ts.Node => {
            // ここでノードの置換処理を行う
            // 例: if (ts.isIdentifier(node) && node.text === 'foo') ...
            return ts.visitEachChild(node, visit, context);
          };
          return ts.visitNode(rootNode, visit) as ts.SourceFile;
        };
      };

      // 5. プログラムを作成
      const program = ts.createProgram([id], compilerOptions, host);

      // 6. emit の第5引数にトランスフォーマーを直接渡して実行
      const emitResult = program.emit(
        undefined, // targetSourceFile (undefined で全ファイル対象、今回はidのみ)
        undefined, // writeFile (host.writeFile が使われるため undefined)
        undefined, // cancellationToken
        undefined, // emitOnlyDtsFiles
        {
          before: [transformerFactory] // ここで置換処理をインジェクションする
        }
      );

      // 万が一これでも出力されない場合のデバッグ用
      if (outputCode === '') {
        console.error('★ Emitに失敗しました。診断エラー:', emitResult.diagnostics);
        return;
      }

      // 7. Vite にコードとソースマップを返却
      return {
        code: outputCode,
        map: sourceMap ? JSON.parse(sourceMap) : null
      };
    }
	}
}

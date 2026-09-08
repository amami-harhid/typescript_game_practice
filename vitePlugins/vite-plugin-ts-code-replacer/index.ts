import { createTransformer } from "./transformers/transformer.ts";
import { transformObjectWrapping } from "./transformers/transformObjectWrapping.ts";
import type { Plugin } from 'vite';
import * as path from 'path';

import remapping from '@ampproject/remapping'; 
import ts from 'typescript';

interface PluginError extends Error {
    loc?: {
        file: string;
        line: number;
        column: number;
    };
    frame?: string;
}

function isPluginError(error: unknown): error is PluginError {
    return error instanceof Error && 'loc' in error;
}

export function TsCodeReplacer(): Plugin {
    // プログラム初期化
    let program: ts.Program | null = null;
    return {
        name: 'vite-plugin-ts-code-replacer',
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
        
              // プロジェクト全体のファイルを最初からすべて含んだ Program を作成
              program = ts.createProgram(configParseResult.fileNames, configParseResult.options);
            },
        transform(code, id) {
            if (!id.endsWith('.ts') || id.includes('node_modules') || id.includes('docs') || id.includes('vitePlugins')) {
                return null;
            }
            if (!id.includes('testV2')) {
                return null;
            }
            if(program == null) return;

            // 開発中にファイルが書き換わった場合は、Program を最新状態に更新する（HMR対応）
            const sourcePath = path.normalize(id).replace(/\\/g, '/');
            const sourceFile = program.getSourceFile(sourcePath);
// もし新しいファイルが追加されたり、既存ファイルが更新されていたら Program を再作成
      if (!sourceFile) {
        const compilerOptions = program.getCompilerOptions();
        const rootNames = Array.from(new Set([...program.getRootFileNames(), sourcePath]));
        program = ts.createProgram(rootNames, compilerOptions, undefined, program);
      }      
            const typeChecker = program.getTypeChecker();

            if (!sourceFile) return null;
            try {
                if( !program ) return null;
                const result = program.emit(sourceFile, undefined, undefined, false, {
                    before: [(context) => createTransformer(id, context, program)]
                })
                // 1. 先にループ構文のAST変換（yield挿入など）を行う
                const transpileResult = ts.transpileModule(code, {
                    compilerOptions: {
                        target: ts.ScriptTarget.Latest,
                        module: ts.ModuleKind.ESNext,
                        sourceMap: true,
                    },
                    fileName: id,
                    transformers: {
                        before: [
                            (context) => createTransformer(id, context, program) // typeCheckerを追加
                        ]
                    }
                });
                
                // 2. TypeScriptが出力した「後」のコードに対して、オブジェクト置換を実行する 
                const wrappedResult = transformObjectWrapping(transpileResult.outputText, id, typeChecker);
                // --- 2つのソースマップをマージする ---
                // 【目的】ブラウザのデバッガがオリジナルのコード行にたどりつけるようにするため。
                // TypeScriptのAST変換=>transformObjectWrappingの順番でコード変換をしているので
                // ２つの変換それぞれのソースマップを紐づけないとオリジナルコード行にたどり着かない。
                if (transpileResult.sourceMapText && wrappedResult.map) {
                    // TypeScriptが生成したマップをオブジェクトに変換
                    const map1 = JSON.parse(transpileResult.sourceMapText);
                    // MagicStringが生成したマップ
                    const map2 = wrappedResult.map;

                    // 2つを結合（最新のmap2から、過去のmap1へと遡るツリーを作る）
                    const mergedMap = remapping(
                        [map2, map1],
                        () => null
                    );

                    return {
                        code: wrappedResult.code,
                        map: mergedMap // 結合された正しいソースマップを返す
                    };
                }
                if(transpileResult.sourceMapText){
                    const map1 = JSON.parse(transpileResult.sourceMapText);
                    return {
                        code: wrappedResult.code,
                        // MagicString側で生成した最新のソースマップを返す
                        map: map1
                    };

                }else{

                }
                return {
                    code: wrappedResult.code,
                    // MagicString側で生成した最新のソースマップを返す
                    map: wrappedResult.map ? wrappedResult.map : null
                };

            } catch (error: unknown) {
                if (isPluginError(error) && error.loc) {
                    const paddedFrame = error.frame ? `\n\n  > ${error.frame}\n` : '';
                    this.error({
                        message: `[vite-plugin-ts-code-replacer] ${error.message}${paddedFrame}`,
                        id: error.loc.file,
                        loc: {
                            line: error.loc.line,
                            column: error.loc.column
                        }
                    });
                } else if (error instanceof Error) {
                    this.error(error.message);
                } else {
                    this.error(String(error));
                }
            }
        }
    };
}

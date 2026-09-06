import { createTransformer } from "./transformers/transformer.ts";
import { transformObjectWrapping } from "./transformers/transformObjectWrapping.ts";
import type { Plugin } from 'vite';

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

        // Vite のビルド開始時（または開発サーバー起動時）に一度だけ Program を初期化
        buildStart() {
            const compilerOptions: ts.CompilerOptions = {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.ESNext,
                // これらが抜けていると、自作クラスや別ファイルの型を解決できず lib.dom.d.ts 等に逃げてしまいます
                moduleResolution: ts.ModuleResolutionKind.NodeNext, 
                esModuleInterop: true,
                strict: false // 置換目的であれば、厳密なチェックはオフで高速化
            };
            console.log('compilerOptions=', compilerOptions);
            // プロジェクトのエントリーポイント、またはtsconfigからファイル一覧を取得するのが理想ですが、
            // 簡易的には空の配列からスタートし、transform 時にルートファイルを差し替えます
            program = ts.createProgram([], compilerOptions);
        },

        transform(code, id) {
            if (!id.endsWith('.ts') || id.includes('node_modules') || id.includes('docs') || id.includes('vitePlugins')) {
                return null;
            }
            if (!id.includes('testV2')) {
                return null;
            }
            // 試行
            //console.log('program=', program);
            if(program == null) return;
            const compilerOptions = program!.getCompilerOptions();
            const rootNames = Array.from(new Set([...program.getRootFileNames(), id]));
            // 更新された Program を作成（これで型が正しく繋がります）
            program = ts.createProgram(rootNames, compilerOptions, undefined, program);
            const typeChecker: ts.TypeChecker = program.getTypeChecker();
            const sourceFile = program.getSourceFile(id);
            if (!sourceFile) return null;

            try {
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
                            (context) => createTransformer(id, context, typeChecker) // typeCheckerを追加
                        ]
                    }
                });

                // 2. TypeScriptが出力した「後」のコードに対して、オブジェクト置換を実行する 
                const wrappedResult = transformObjectWrapping(transpileResult.outputText, id);
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

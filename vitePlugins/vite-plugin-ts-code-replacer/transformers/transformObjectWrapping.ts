import MagicString from 'magic-string';
import { PluginError } from './transformer.ts';
import { Project, SyntaxKind } from 'ts-morph';
import { CLASS_SYMBOL, type_definition_files } from '../utils/typeDefineSymbolSet.ts';

// パフォーマンス向上のため、Projectインスタンスはファイル間で使い回す（シングルトン）
let project: Project | null = null;

function getOrInitProject(rootPath: string): Project {
    if (project) return project;

    project = new Project({
        compilerOptions: { target: 99 /* ESNext */ },
        skipAddingFilesFromTsConfig: true, // 高速化
    });

    const targetFiles = type_definition_files(rootPath);

    // 型ファイルをループでプロジェクトに一括登録
    targetFiles.forEach(filePath => {
        try {
            project!.addSourceFileAtPath(filePath);
        } catch (e) {
            console.warn(`[vite-plugin-ts-code-replacer] Failed to load type definition file: ${filePath}`);
        }
    });

    return project;
}
export function transformObjectWrapping(code: string, id: string): { code: string; map: any } {
    return { code, map: null };
}

export function transformObjectWrapping2(code: string, id: string): { code: string; map: any } {
    // 【超軽量プレフィルター】    
    // コード内に "Font" "Image" "Sound" "monitoring" のいずれも無ければ解析すらしない
    if (!code.includes('Font') 
        && !code.includes('FontImage') 
        && !code.includes('Image') 
        && !code.includes('Sound') 
        && !code.includes('monitoring')) {
        return { code, map: null };
    }

    const currentProject = getOrInitProject(process.cwd());
    const sourceFile = currentProject.createSourceFile(id, code, { overwrite: true });
    const typeChecker = currentProject.getTypeChecker();
    const s = new MagicString(code);
    let hasChanges = false;

    // ----------------------------------------------------
    // 処理1: new Ts.Font(), new Ts.Image(), new Ts.Sound() の探索 (NewExpression)
    // ----------------------------------------------------
    sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression).forEach((newExpr) => {
        const constructorExpression = newExpr.getExpression();
        const constructorType = typeChecker.getTypeAtLocation(constructorExpression);

        // クラスブランドがついている型かを点検する
        const isTargetClass = constructorType.getProperties().some(prop => {
            const name = prop.getName();
            return  name.includes(CLASS_SYMBOL.FONT_CLASS_BRAND) 
                || name.includes(CLASS_SYMBOL.FONT_IMAGE_CLASS_BRAND) 
                || name.includes(CLASS_SYMBOL.IMAGE_CLASS_BRAND) 
                || name.includes(CLASS_SYMBOL.SOUND_CLASS_BRAND);
        });

        if (isTargetClass) {
            processArguments(newExpr.getArguments(), newExpr.getText(), id, code, s, () => {
                hasChanges = true;
            });
        }
    });

    // ----------------------------------------------------
    // 処理2: Ts.Variable.Monitoring() の探索 (CallExpression)
    // ----------------------------------------------------
    sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((callExpr) => {
        const expression = callExpr.getExpression();

        // 💡 メソッド呼び出し（PropertyAccessExpression: 例 Ts.Variable.monitoring）であることを確認
        if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
            const propAccess = expression as any;
            const methodName = propAccess.getName();

            // メソッド名が "monitoring" のときだけ次の型チェックに進む（高速化）
            if (methodName === 'monitoring') {
                // メソッドの持ち主（例: Ts.Variable）の型を取得
                const objectExpression = propAccess.getExpression();
                const objectType = typeChecker.getTypeAtLocation(objectExpression);

                // 持ち主の型が「VARIABLE_CLASS_BRAND」を持っているか判定
                const isTargetMethod = objectType.getProperties().some((prop) => {
                    const name = prop.getName();
                    return name.includes( CLASS_SYMBOL.VARIABLE_CLASS_BRAND );
                });
                if (isTargetMethod) {
                    processArguments(callExpr.getArguments(), callExpr.getText(), id, code, s, () => {
                        hasChanges = true;
                    });
                }
            }
        }
    });

    // メモリリーク防止のため、仮想ファイルを即座に解放
    currentProject.removeSourceFile(sourceFile);
    (currentProject as any)._cachedProgram = undefined;

    return {
        code: s.toString(),
        map: s.generateMap({ hires: true })
    };
}

/**
 * 引数の数をチェックし、オブジェクトリテラルへの書き換え、およびバリデーションを行う共通ヘルパー
 */
function processArguments(
    args: any[], 
    fullMatchText: string, 
    id: string, 
    code: string, 
    s: MagicString, 
    onChanged: () => void
) {
    // 仕様：引数は1個のみの前提
    if (args.length !== 1) return;

    const firstArg = args[0];
    
    // 仕様：すでにオブジェクトリテラルのときは何もしない
    if (firstArg.getKind() === SyntaxKind.ObjectLiteralExpression) {
        return;
    }

    const argumentText = firstArg.getText();
    const cleanArg = argumentText.trim();

    // 既存仕様：識別子（変数名）かどうかのバリデーション
    const isIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cleanArg);

    if (!isIdentifier) {
        const startPos = firstArg.getStart();
        const { line, column } = getLineAndColumn(code, startPos);
        
        const error = new Error(`Please specify a variable as the argument. Automatic object conversion is not supported.`) as PluginError;
        error.loc = { file: id, line, column };
        error.frame = fullMatchText;
        throw error;
    }

    // 引数の開始・終了位置を特定して、ピンポイントで `{ }` で囲む
    // 元のインデンテーションや改行は完全に維持されます
    const start = firstArg.getStart();
    const end = firstArg.getEnd();

    s.overwrite(start, end, `{ ${argumentText} }`);
    onChanged();
}
/**
 * 文字列のインデックスから行番号と列番号（1始まり）を計算するヘルパー
 */
function getLineAndColumn(code: string, index: number): { line: number; column: number } {
    const lines = code.substring(0, index).split('\n');
    return {
        line: lines.length,
        column: lines[lines.length - 1].length + 1
    };
}
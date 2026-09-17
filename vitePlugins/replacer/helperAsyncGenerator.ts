/**
 * 特徴(ts-morph)
 * 1.スコープを自動で解決してくれる
 * TypeScriptのコンパイラAPIを利用して「この場所にある A が、どのスコープのどの const A を指しているか」
 * を1発で正確に特定します。同名の別変数を誤って書き換えるリスクがゼロになります。
 * 2. 直感的なAPI
 * funcExpr.setIsAsync(true) や setIsGenerator(true) を呼ぶだけで、ts-morph が自動的に適切な位置へ 
 * async や * を挿入し、コードを再フォーマットしてくれます。
 * 文字数を計算して手動で書き換える（overwrite する）必要がありません。
 * 3. アロー関数への対応も容易
 * もし元のコードが const A = () => {} だった場合、ジェネレータ化するには function 構文にする必要が
 * ありますが、それも上記の例のように replaceWithText で簡単に対応可能です。
 */
import * as ts from 'typescript';
import { Node, Expression, Project, SyntaxKind, PropertyAccessExpression, SourceFile } from 'ts-morph';
import MagicString from 'magic-string';
import path from 'path';
import * as Cache from './memoryCache.ts';
import targetThreadSetter from './targetThreadSetter.json' with { type: 'json' };
import * as TagMark from './TagMarks.ts';

// パフォーマンス向上のため、Projectインスタンスはファイル間で使い回す（シングルトン）
let project: Project | null = null;

function getOrInitProject(rootPath: string): Project {
    if (project) return project;

    project = new Project({
        compilerOptions: { target: 99 /* ESNext */ },
        skipAddingFilesFromTsConfig: true, // 高速化
    });

    return project;
}

// 置換位置を記録するための配列
const replacements: { start: number; end: number; text: string }[] = [];

/**
 * function を async function* とする
 * 置換結果はMagicStringへ書き込む
 * @param expr 
 * @returns 
 */
const funcToAsyncGenerator = (expr: Expression<ts.Expression>): boolean => {
    let hasChanged = false;
    const funcExpr = expr.asKindOrThrow(SyntaxKind.FunctionExpression);
    if (!funcExpr.isAsync() && !funcExpr.isGenerator()) {
        //console.log('not async generator');
        // async 属性を true に書き換える
        //funcExpr.setIsAsync(true);
        const start = funcExpr.getStart();
        replacements.push({
            start: start,
            end: start + 8, // "function" の長さ
            text: 'async function*'
        });
        hasChanged = true;
    }else if(!funcExpr.isAsync()) {
        //console.log('not async');
        const start = funcExpr.getStart();
        replacements.push({
            start: start,
            end: start + 8, // "function" の長さ
            text: 'async function'
        });
        hasChanged = true;
    }else if(!funcExpr.isGenerator()) {
        //console.log('not generator');
        const start = funcExpr.getStart();
        replacements.push({
            start: start,
            end: start + 8, // "function" の長さ
            text: 'function*'
        });
        hasChanged = true;    
    }
    return hasChanged;
}
/**
 * アロー関数を async function* へと置換する
 * @param expr 
 * @returns 
 */
const arrowToAsyncGenerator = (expr: Expression<ts.Expression>): boolean => {
    const arrowFunc = expr.asKindOrThrow(SyntaxKind.ArrowFunction);
    const bodyText = arrowFunc.getBody().getText();
    const paramsText = arrowFunc.getParameters().map(p => p.getText()).join(', ');
    const start = arrowFunc.getStart();
    const end = arrowFunc.getEnd();

    // アロー関数を async function* () {} の文字列に置き換える
    const code = `async function* (${paramsText}) ${bodyText}`;
    replacements.push({
        start: start,
        end: end, // "function" の長さ
        text:  code
    });
    return true;
}

/**
 * CallExpressionを探索し、Await付与のターゲットである場合に、
 * awaitがついていなければawaitをつけ、直接の親functionがasyncで
 * なければasyncにする(後続の置換トランスフォーマーエラー回避のため)
 * Await付与ターゲットはJSON(awaitTargets.json)に登録されている
 * ものとする。
 * なお、このメソッドでは「MagicString」と「ts-morph」を使用している
 * @param code 
 * @param id 
 * @returns 
 */
export function asyncGeneratorTransformer(code: string, id: string ): { code: string; map: any } {
    // if ( !isTargetId(id)) {
    //     return {code: code, map: null}
    // }
    const magicString = new MagicString(code)
    const currentProject = getOrInitProject(process.cwd());
    //const typeChecker = currentProject.getTypeChecker();
    const sourceFile = currentProject.createSourceFile(id, code, { overwrite: true });
    replacements.splice(0, replacements.length); // 配列要素をゼロ個にする
    let hasChanged = false;
    // 代入式（PropertyAccessExpression = Identifier）を走査
    const assignments = sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression);
    for(const assignment of assignments){
        //console.log('assignment=', assignment.getText())
        // `=` 演算子であることを確認
        if (assignment.getOperatorToken().getKind() == SyntaxKind.EqualsToken) {
            //console.log('assignment =', assignment.getText());
            const leftExpression = assignment.getLeft();
            const rightExpression = assignment.getRight();
            // 左辺が `xxx.Thread.func` のようなプロパティアクセスか確認
            if (leftExpression.getKind() === SyntaxKind.PropertyAccessExpression) {

                const leftText = leftExpression.getText();
                // 特定のパターン（末尾が .Thread.func）にマッチするか確認
                const words = leftText.replace(/^.+\.(.+\..+)$/, "$1");
                if (targetThreadSetter.targets.includes(words)) {
                    //console.log(leftExpression.getText());
                    const children = leftExpression.getChildren();
                    const func = children[children.length-1];
                    //console.log(func.getText());
                    //console.log(func.getKind()); // --> 80
                    if(func.getKind() == SyntaxKind.Identifier) {
                        const setterNode = func.getParent();
                        if( Node.isPropertyAccessExpression(setterNode)) {
                            const propertyAccessExp = setterNode as PropertyAccessExpression;
                            //console.log(propertyAccessExp.getKindName());
                            const symbol = propertyAccessExp.getSymbol();
                            if(symbol){
                                const declarations = symbol.getDeclarations();
                                const setterDeclaration = declarations.find(Node.isSetAccessorDeclaration);
                                if (setterDeclaration) {
                                    const jsDocs = setterDeclaration.getJsDocs();
                                    const match = jsDocs.some((jsDoc)=>{
                                        const jsDocText = jsDoc.getText();
                                        if(jsDocText.includes( TagMark.THREAD_SETTER_COMMENT )) {
                                            //console.log('====== @needsAsyncGenerator =====')
                                            return true;
                                        }
                                    });
                                    //console.log('match=', match)
                                    if(match) {
                                        hasChanged = replaceRightExpression(rightExpression, sourceFile);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    };

    // magic-string を使って、安全に一括置換を行う
    //console.log('replacements=', replacements)
    for (const r of replacements) {
        magicString.overwrite(r.start, r.end, r.text);
    }
    const finalCode = magicString.toString();
    const map = magicString.generateMap(
        { 
            hires: true, 
            source: path.basename(id),
            includeContent: true,
        }
    )

    if (!hasChanged) {
        // メモリ解放のためにソースファイルを削除
        currentProject.removeSourceFile(sourceFile);
        return {
            code : finalCode,
            map: map,
        };
    }
    // メモリ解放のためにソースファイルを削除
    currentProject.removeSourceFile(sourceFile);

    return {
        code: finalCode,
        map: map,
    }
}

const replaceRightExpression = (rightExpression: Expression<ts.Expression>, sourceFile: SourceFile) => {
    let hasChanged = false;
                    if (rightExpression.getKind() === SyntaxKind.Identifier) {
                        // セッターに変数（関数）を代入しているとき
                        //console.log('=====#0001')
                        const rightIdentifier = rightExpression.asKindOrThrow(SyntaxKind.Identifier);
                        // ts-morphの機能：変数の「定義元（宣言）」を直接取得する
                        const definitions = rightIdentifier.getDefinitions();
                        //console.log('-------- definitions=', definitions)
                        for (const def of definitions) {
                            const declarationNode = def.getDeclarationNode();
                            //console.log('def=', (declarationNode)? declarationNode.getText(): 'undefined');
                            if (!declarationNode) continue;
                            const targetFile = declarationNode.getSourceFile();
                            let isSameSourceFile = true;
                            if(targetFile != sourceFile) {
                                // 宣言が別ファイルのとき
                                isSameSourceFile = false;
                                //console.log('===== 別ファイルに定義がある')
                            }
                            //console.log('=====#0001-001 isSameSourceFile=', isSameSourceFile)
                            // 宣言が別ファイルでないとき
                            // 変数宣言（const XXX = ...）であるか確認
                            if (declarationNode.getKind() === SyntaxKind.VariableDeclaration) {
                                const variableDeclarator = declarationNode.asKindOrThrow(SyntaxKind.VariableDeclaration);
                                const initializer = variableDeclarator.getInitializer();
                                if(initializer){
                                    // 通常の関数式 (function() {}) の場合
                                    if (initializer.getKind() === SyntaxKind.FunctionExpression) {
                                        if(!isSameSourceFile){
                                            //console.log('=====#0001-002 ')
                                            const func = initializer.asKindOrThrow(SyntaxKind.FunctionExpression);
                                            const bodyText = func.getBody().getText();
                                            const paramsText = func.getParameters().map(p => p.getText()).join(', ');
                                            func.replaceWithText(`async function* (${paramsText}) ${bodyText}`);
                                            const replacedId = targetFile.getFilePath()
                                            const replacedCode = targetFile.getText();
                                            Cache.MemoryCache.set(replacedId, replacedCode);
                                            targetFile.forget(); // 読み込み直し
                                        }else{
                                            //console.log('=====#0001-003 ')
                                            hasChanged = funcToAsyncGenerator(initializer);
                                        }
                                    }
                                    // もしアロー関数 (async () => {}) だった場合の考慮
                                    // （アロー関数は generator になれないため、通常の関数式へ変換が必要）
                                    else if (initializer.getKind() === SyntaxKind.ArrowFunction) {
                                        //console.log('=====#0001-004 ')
                                        // アロー関数を async function* () {} の文字列に置き換える
                                        hasChanged = arrowToAsyncGenerator(initializer);
                                    }
                                }
                            }
                        }
                    }else {
                        // セッターに関数を代入しているとき
                        //console.log('=====#0002')
                        // 右辺が識別子（関数）であるか確認
                        if (rightExpression.getKind() === SyntaxKind.FunctionExpression) {
                            //console.log('=====#0002- 001')
                            hasChanged = funcToAsyncGenerator(rightExpression);
                        } else if (rightExpression.getKind() === SyntaxKind.ArrowFunction) {
                            //console.log('=====#0002- 002')
                            // アロー関数を async function* () {} の文字列に置き換える
                            // hasChanged = true;
                            hasChanged = arrowToAsyncGenerator(rightExpression);
                        }
                    } 
    return hasChanged;
}
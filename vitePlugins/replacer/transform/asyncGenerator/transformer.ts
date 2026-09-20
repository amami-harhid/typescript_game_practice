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
import { Node, Project, SyntaxKind, PropertyAccessExpression, SourceFile, ArrowFunction } from 'ts-morph';
import MagicString from 'magic-string';
import * as path from 'path';
import targetThreadSetter from '../../json/targetThreadSetter.json' with { type: 'json' };
import * as TagMark from '../../TagMarks.ts';
import * as Helper from '../../helper.ts';
import * as REPLACER from './asyncGeneratoReplacer.ts';
import * as RightExpression from './asyncGeneratorRightExpression.ts'

// トランスフォーマーを呼び出すごとに新しくProjectを作る
function getOrInitProject(): Project {

    const project = new Project({
        compilerOptions: { target: 99 /* ESNext */ },
        skipAddingFilesFromTsConfig: true, // 高速化
    });

    return project;
}

/**
 * スレッドのセッターを探索して、セッターに代入している関数を AsyncGenerator関数に置換する。
 * セッターへ関数を代入している場合はその関数を置換、セッターへ変数を代入している場合は
 * その変数の宣言を探索し、変数へ代入している関数を置換する。
 * なお変数の宣言の探索はimport先(別のコードファイル)まで追跡して置換する。
 * スレッドセッターの探索方法はJSON(targetThreadSetter.json)に登録されているものとする。
 * なお、このメソッドでは「MagicString」と「ts-morph」を使用している
 * @param {string} code コード 
 * @param {string} id ファイルパス 
 * @param {IsInsideTarget} isInsideTarget Vite管理下にあるソースかを確認するユーティリティ
 * @param {EmitErrorWrapper} emitError 独自エラーメッセージ送信するメソッド
 * @returns 
 */
export function transform(code: string, id: string, isInsideTarget: Helper.IsInsideTarget, emitError: Helper.EmitErrorWrapper ): { code: string; map: any, forceError: boolean } {
    const magicString = new MagicString(code)
    const currentProject = getOrInitProject();
    const sourceFile = currentProject.createSourceFile(id, code, { overwrite: true });
    REPLACER.replacements.splice(0, REPLACER.replacements.length); // 配列要素をゼロ個にする
    let hasChanged = false;
    let forceError = false;
    // 代入式（PropertyAccessExpression = Identifier）を走査
    const assignments = sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression);
    for(const assignment of assignments){ //【A】assignmentsループ
        // `=` 演算子であることを確認
        if (assignment.getOperatorToken().getKind() == SyntaxKind.EqualsToken) {
            const leftExpression = assignment.getLeft();
            const rightExpression = assignment.getRight();
            // 左辺が `xxx.Thread.func` のようなプロパティアクセスか確認
            if (leftExpression.getKind() === SyntaxKind.PropertyAccessExpression) {

                const leftText = leftExpression.getText();
                // 特定のパターン（末尾が .Thread.func）にマッチするか確認
                const words = leftText.replace(/^.+\.(.+\..+)$/, "$1");
                if (targetThreadSetter.targets.includes(words)) {
                    //console.log(words)
                    const children = leftExpression.getChildren();
                    const func = children[children.length-1]; // xxx.Thread.func のときに 最後のNode(=func)を取り出す
                    if(func.getKind() == SyntaxKind.Identifier /* (80) */) {  
                        const setterNode = func.getParent();
                        if( Node.isPropertyAccessExpression(setterNode)) {
                            const propertyAccessExp = setterNode as PropertyAccessExpression;
                            // セッターの左側のJSDOCを探索し、条件に合致するときは
                            // セッターの右側を探索して置換処理をする。
                            const symbol = propertyAccessExp.getSymbol();
                            if(symbol){
                                const declarations = symbol.getDeclarations();
                                const setterDeclaration = declarations.find(Node.isSetAccessorDeclaration);
                                if (setterDeclaration) {
                                    const jsDocs = setterDeclaration.getJsDocs();
                                    const match = jsDocs.some((jsDoc)=>{
                                        const jsDocText = jsDoc.getText();
                                        if(jsDocText.includes( TagMark.THREAD_SETTER_TAG )) {
                                            return true;
                                        }
                                    });
                                    if(match) {
                                        // TagMark.THREAD_SETTER_TAGがJSDOCに書かれている場合
                                        // セッターに代入している方を探索して置換処理をする
                                        const rightRslt = RightExpression.replacer(id, rightExpression, sourceFile, isInsideTarget, emitError);
                                        hasChanged = rightRslt.hasChanged;
                                        if(rightRslt.forceError && rightRslt.forceError === true){
                                            forceError = rightRslt.forceError;
                                            // 【A】assignmentsループを抜ける
                                            //console.log('【A】assignmentsループを抜ける')
                                            break;
                                        }
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
    //console.log('REPLACER.replacements=', REPLACER.replacements)
    for (const r of REPLACER.replacements) {
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
            forceError: forceError
        };
    }
    // メモリ解放のためにソースファイルを削除
    currentProject.removeSourceFile(sourceFile);

    return {
        code: finalCode,
        map: map,
        forceError: forceError
    }
}


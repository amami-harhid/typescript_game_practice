import { JSDocTagInfo, Project, PropertyAccessExpression, Symbol, SyntaxKind } from 'ts-morph';
import MagicString from 'magic-string';
import awaitTargetsJson from './json/targetAwait.json' with { type: 'json' };
import * as path from 'path';
import * as TagMark from './TagMarks.ts';
import type { ErrorObj, EmitErrorWrapper, ClearCache } from './helper.ts';

export const getAwaitTargets = (): [string[], string[] ] => {
    const list:string[] = [];
    const listFull:string[] = [];
    for(const item of awaitTargetsJson.targets) {
        list.push( item.name );
        listFull.push( item.fullName );
    }
    return [list, listFull];
}

const [_, awaitTargetFullMethods] = getAwaitTargets();

/** トランスフォーマーを呼び出すごとに新しくProjectを作る */ 
function getOrInitProject(): Project {

    const project = new Project({
        compilerOptions: { target: 99 /* ESNext */ },
        skipAddingFilesFromTsConfig: true, // 高速化
        //useInMemoryFileSystem: true // メモリだけで完結させる
    });

    return project;
}
/**
 * CallExpressionを探索し、Await付与のターゲットである場合に、
 * awaitがついていなければawaitをつけ、直接の親functionがasyncで
 * なければasyncにする(後続の置換トランスフォーマーエラー回避のため)
 * Await付与ターゲットはJSON(targetAwait.json)に定義されているものとする。
 * なお、このメソッドでは「MagicString」と「ts-morph」を使用している
 * @param {string} code コード 
 * @param {string} id ファイルパス 
 * @param {CustomError} emitError 独自エラーメッセージ送信するメソッド
 * @returns 
 */
export function awaitTransformer(
    code: string, 
    id: string, 
    emitError: EmitErrorWrapper,
): { code: string; map: any } {

    // プロジェクトの再作成をすることで キャッシュの衝突回避対応は不要です
    // キャッシュの衝突を防ぐため、元の id の末尾にダミーの接尾辞をつける
    // 例: "src/main.ts" -> "src/main.stage2.ts"
    //const date = new Date();
    //const dummyId = id.replace(/(\.[jt]sx?)$/, '.stage2'+date.getTime()+'$1');

    const magicString = new MagicString(code)
    const currentProject = getOrInitProject();

    // プロジェクトの再作成をすることで 既存ファイルの明示的な削除は不要です
    // const existingFile = currentProject.getSourceFile(id);
    // if(existingFile){
    //     // もし既存のファイルが残っていたら明示的に削除してキャッシュを飛ばす
    //     currentProject.removeSourceFile(existingFile);
    // }

    // 最新の code（前段トランスフォーマで 置換されたもの）でファイルを新規作成
    const sourceFile = currentProject.createSourceFile(id, code, { overwrite: true });
    const typeChecker = currentProject.getTypeChecker();

    // Call Expression の探索
    sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((callExpr) => {
        // 親ノードが AwaitExpression（await構文）であるかを確認
        const awaitExpr = callExpr.getParentIfKind(SyntaxKind.AwaitExpression);
        // awaitExpr が存在すれば await が付いている、存在しなければ付いていない
        const hasAwait = awaitExpr !== undefined;
        if(hasAwait){
            // await があれば無視
            return;
        }

        // 直親の関数定義を得る
        const parentFunction = callExpr.getFirstAncestorByKind(SyntaxKind.FunctionExpression)
                            || callExpr.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration)
                            || callExpr.getFirstAncestorByKind(SyntaxKind.MethodDeclaration)
                            || callExpr.getFirstAncestorByKind(SyntaxKind.ArrowFunction);
        let isParentFunctionAsync = false;
        if(parentFunction && parentFunction.isAsync()) {
            isParentFunctionAsync = true;
        }
        const expression = callExpr.getExpression(); // // 型 LeftHandSideExpression<ts.LeftHandSideExpression>
        if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
            const propAccess = expression as PropertyAccessExpression;
            const methodName = propAccess.getName(); // this.Control.wait(10) ==> wait
            const objectExpression = propAccess.getExpression(); // 型 LeftHandSideExpression<ts.LeftHandSideExpression>
            // 左側のプロパティを取り出す
            // 例）this.Control.wait のとき"Control"を得る
            const objectName = objectExpression.getKind() === SyntaxKind.PropertyAccessExpression
                    ? (objectExpression as PropertyAccessExpression).getName()
                    : objectExpression.getText();
            // 例) this.Control.waitのとき "Control.wait"を得る
            const targetText = `${objectName}.${methodName}`;
            // 登録されているときは この callExprのJSDocのチェックをする
            if( awaitTargetFullMethods.includes(targetText)) {
                // JSDOC を取り込む
                const _objectType = typeChecker.getTypeAtLocation(objectExpression);
                _objectType.getProperties().some((prop: Symbol)=> {
                    const tags = prop.getJsDocTags();
                    if(tags){
                        // JSDOCにタグ(@needsAwait)があれば
                        // await付与をする
                        tags.forEach((tag: JSDocTagInfo)=>{
                            const tagName = tag.getName(); // this.Control.wait(10) ==> wait のJSDOCにある タグ @～
                            //console.log('tagName=', tagName);
                            const NeedsAwait = TagMark.NEEDS_AWAIT_METHOD_TAG.replace(/^@/, ''); // 先頭の@を消す
                            if( tagName == NeedsAwait) {
                                // 直親の関数定義がAsync でないとき
                                if(!isParentFunctionAsync && parentFunction){
                                    // 行番号
                                    const lineNo = callExpr.getStartLineNumber();
                                    // 列番号 = ノード全体の開始位置 - 行の開始位置 + 1 
                                    const columnNo = callExpr.getStart() - callExpr.getStartLinePos() + 1;
                                    // 先にTS-Morphメモリを解放する(エラー表示後のホットリロード時に全コードの整合性を保つ)ために【A】【B】を行う
                                    // 【A】ts-morph のメモリ解放
                                    sourceFile.forget(); 
                                    // 【B】エラーメッセージを表示する
                                    const errObj : ErrorObj = {
                                        message: 'awaitを使うにはasync型の関数へと変更してください',
                                        id: id,
                                        loc: { line: lineNo, column: columnNo } // オプション: エラー箇所の行・列
                                    };
                                    emitError(errObj);
                                }else{
                                    const start = callExpr.getStart();
                                    // 左側に("await ")を追加する
                                    magicString.appendLeft(start, 'await ');

                                    return true;

                                }
                            }
                            return false;
                        });
                        // forEach内で return true or falseしているが
                        // 処理場の意味は特にない。
                        // 処理した or していない をコード上で人間に分かりやすく
                        // したいからの意味だけである。
                        return false;
                    }
                });
            }
        }
    });

    // 【★Ａ】
    // map 結合時に sourcesを一致させてマップパイプラインを
    // つなげるようにするための考慮である
    const baseId = path.basename(id);

    currentProject.removeSourceFile(sourceFile)

    return {
        code : magicString.toString(), 
        map: magicString.generateMap(
            {
                hires: true,
                source: baseId, // <=== 【★Ａ】
                includeContent: true,
            })
    };
}


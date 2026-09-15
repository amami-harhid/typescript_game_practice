import { JSDocTagInfo, Project, PropertyAccessExpression, Symbol, SyntaxKind } from 'ts-morph';
import MagicString from 'magic-string';
import awaitTargetsJson from './awaitTargets.json' with { type: 'json' };
import path from 'path';

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
export function transformObject(code: string, id: string ): { code: string; map: any } {
    const magicString = new MagicString(code)
    const currentProject = getOrInitProject(process.cwd());
    const sourceFile = currentProject.createSourceFile(id, code, { overwrite: true });
    const typeChecker = currentProject.getTypeChecker();
    // new Expression の探索
    //sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression).forEach((newExpr) => {
        //const constructorExpression = newExpr.getExpression();
        //console.log('constructorExpression', constructorExpression.getText());        
    //});

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
        const text = callExpr.getText();
        //console.log('[1]callExpr.getText()= ', text); // this.Control.wait(10) ==>  this.Control.wait(10)
        const expression = callExpr.getExpression(); // // 型 LeftHandSideExpression<ts.LeftHandSideExpression>
        if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
            const propAccess = expression as PropertyAccessExpression;
            const methodName = propAccess.getName(); // this.Control.wait(10) ==> wait
            //console.log('[3]propAccess.getText()=', propAccess.getText());
            //console.log('methodName=', methodName);
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
                            if( tagName == 'needsAwait') {
                                const start = callExpr.getStart();
                                //const end = callExpr.getEnd();
                                //console.log('magicstring appendLeft ', `await ${text}`);
                                // 左側に("await ")を追加する
                                magicString.appendLeft(start, 'await ');

                                // 直親の関数定義を得る
                                const parentFunction = callExpr.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration)
                                || callExpr.getFirstAncestorByKind(SyntaxKind.MethodDeclaration)
                                || callExpr.getFirstAncestorByKind(SyntaxKind.ArrowFunction);
                                // 直親の関数定義があり、それが「Async」でないとき
                                if(parentFunction && !parentFunction.isAsync()) {
                                    // (安全対策)setIsAsyncメソッドがあるかを確認
                                    if('setIsAsync' in parentFunction) {
                                        parentFunction.setIsAsync(true);
                                    }
                                }
                                return true;
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


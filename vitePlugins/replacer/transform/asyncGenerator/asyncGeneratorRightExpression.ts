import * as ts from 'typescript';
import { ArrowFunction, Expression, Node, SourceFile, SyntaxKind } from "ts-morph";
import * as Helper from '../../helper.ts';
import * as Replacer from './asyncGeneratoReplacer.ts';
import { tracer } from './tracer.ts';

/**
 * スレッドセッターへ格納する「何か」の定義元を探索し、探索し終わったときの後始末
 * 
 * @param {string} id 
 * @param {Node<ts.Node>} finalNode 
 * @param {SourceFile} sourceFile 
 * @returns 
 */
const finalNodeAction = (id: string, finalNode: Node<ts.Node>, sourceFile: SourceFile) => {
    let hasChanged = false;
    const targetFile = finalNode.getSourceFile();
    if(sourceFile == targetFile){
        //console.log('同一ファイル')
        // 同一ファイル
        if(finalNode.getKind()===SyntaxKind.FunctionExpression){
            const funcExpression = finalNode.asKindOrThrow(SyntaxKind.FunctionExpression);
            Replacer.funcToAsyncGenerator(funcExpression);
            hasChanged = true;
            return {hasChanged: true, forceError: false};
        }else if(finalNode.getKind()===SyntaxKind.MethodDeclaration){
            const method = finalNode.asKindOrThrow(SyntaxKind.MethodDeclaration);
            Replacer.methodToAsyncGenerator(method);
            hasChanged = true;
            return {hasChanged: true, forceError: false};
        }else if(finalNode.getKind()===SyntaxKind.ArrowFunction){
            const arrow = finalNode.asKindOrThrow(SyntaxKind.ArrowFunction);
            Replacer.arrowFuncErrorAction(id, arrow, sourceFile);
            return {hasChanged: false, forceError: true};
        }else{
            console.log('同一ファイル ');
            console.log(sourceFile.getFilePath());
            console.log(finalNode.getKindName());
            console.log(finalNode.getText());
        }
    }else{
        //console.log('異なるファイル')
        // 異なるファイル
        if(finalNode.getKind()===SyntaxKind.FunctionExpression){
            const funcExpression = finalNode.asKindOrThrow(SyntaxKind.FunctionExpression);
            Replacer.funcToAsyncGeneratorAnotherFile(funcExpression, targetFile);
            return {hasChanged: true, forceError: false};
        }else if(finalNode.getKind()===SyntaxKind.MethodDeclaration){
            const method = finalNode.asKindOrThrow(SyntaxKind.MethodDeclaration);
            Replacer.methodToAsyncGeneratorAnotherFile(method, targetFile);
            return {hasChanged: true, forceError: false};
        }else if(finalNode.getKind()===SyntaxKind.ArrowFunction) {
            const arrow = finalNode.asKindOrThrow(SyntaxKind.ArrowFunction);
            Replacer.arrowFuncErrorActionAnotherFile(arrow);
            return {hasChanged: false, forceError: true};
        }else{
            console.log('同一ファイル ');
            console.log(sourceFile.getFilePath());
            console.log(finalNode.getKindName());
            console.log(finalNode.getText());
        }
    }
    return {hasChanged: false, forceError: false};
}
/**
 * Vite定義外のスレッドをスレッドセッターへ代入しようと
 * したときのエラー
 * @param { Expression<ts.Expression> } expression
 */
const outSideError = (expression : Expression<ts.Expression>)  :Helper.ErrorObj => {
    // 行番号
    const lineNo = expression.getStartLineNumber();
    // 列番号 = ノード全体の開始位置 - 行の開始位置 + 1 
    const columnNo = expression.getStart() - expression.getStartLinePos() + 1;
    // 先にTS-Morphメモリを解放する(エラー表示後のホットリロード時に全コードの整合性を保つ)ために【A】を行う
    // 【A】ts-morph のメモリ解放
    const sourceFile = expression.getSourceFile();
    //sourceFile.forget();
    const id = sourceFile.getFilePath();
    const errObj : Helper.ErrorObj = {
        message: '定義元が範囲外にあるためスレッドとして使用できません',
        id: id,
        loc: { line: lineNo, column: columnNo }, // オプション: エラー箇所の行・列
        customSend: true,
    };
    return errObj;
}
/**
 * 左側の置換処理
 * @param {string} id 対象ファイルのパス
 * @param {Expression<ts.Expression>} rightExpression 左部のExpression 
 * @param {SourceFile} sourceFile 
 * @returns 
 */
export const replacer = (id:string, rightExpression: Expression<ts.Expression>, sourceFile: SourceFile): {hasChanged:boolean, forceError?: boolean} => {
    let hasChanged = false;
    // 右側が『PropertyAccessExpression』のとき
    // クラスインスタンスメソッドまたはリテラルオブジェクトのメソッドの場合が想定される
    if (rightExpression.getKind() === SyntaxKind.PropertyAccessExpression){
        const finalNode = tracer(rightExpression);
        if(finalNode == undefined){
            //console.log('finalNode is undefined [001]');
            const errObj = outSideError(rightExpression);
            Helper.emitError(errObj);
        }
        if(finalNode){
            hasChanged = true;
            const rtn = finalNodeAction(id, finalNode, sourceFile);
            hasChanged = rtn.hasChanged;
        }

    }
    // 右側が「識別子（名前）」(Identifier)のとき
    if (rightExpression.getKind() === SyntaxKind.Identifier) {
        const rightIdentifier = rightExpression.asKindOrThrow(SyntaxKind.Identifier);
        const finalNode = tracer(rightIdentifier);
        if(finalNode == undefined){
            const errObj = outSideError(rightExpression);
            Helper.emitError(errObj);
        }
        if(finalNode){
            const rtn = finalNodeAction(id, finalNode, sourceFile);
            hasChanged = rtn.hasChanged;
        }
    }else {
        // セッターに変数を代入していない場合の処理
        // すなわちセッターに関数を代入していることになるが、そのときは同一ファイルになるので
        // 別ファイルの考慮は不要である。

        // 右辺が識別子（関数）であるか確認する
        if (rightExpression.getKind() === SyntaxKind.FunctionExpression) {
            // セッターに「function」を代入しているとき
            // 関数を async function* にする
            hasChanged = Replacer.funcToAsyncGenerator(rightExpression);
        } else if (rightExpression.getKind() === SyntaxKind.ArrowFunction) {
            // アロー関数の場合, エラーにする
            hasChanged = false;
            const func = rightExpression as ArrowFunction;
            Replacer.arrowFuncErrorAction(id, func, sourceFile);
        }
    } 
    return {hasChanged: hasChanged};

}
import * as ts from 'typescript';
import { Expression, SyntaxKind, SourceFile, MethodDeclaration, FunctionExpression, ArrowFunction } from 'ts-morph';
import * as Cache from '../../memoryCache.ts';
import { EmitErrorWrapper, ErrorObj } from '../../helper.ts';

/**
 * 置換位置を記録するための配列
 */
export const replacements: { start: number; end: number; text: string }[] = [];

/**
 * function を async function* とする
 * 置換結果はMagicStringへ書き込む
 * @param expr 
 * @returns 
 */
export const funcToAsyncGenerator = (expr: Expression<ts.Expression>): boolean => {
    let hasChanged = false;
    const funcExpr = expr.asKindOrThrow(SyntaxKind.FunctionExpression);
    if (!funcExpr.isAsync() && !funcExpr.isGenerator()) {
        // async 属性を true に書き換える
        const start = funcExpr.getStart();
        replacements.push({
            start: start,
            end: start + 8, // "function" の長さ
            text: 'async function*'
        });
        hasChanged = true;
    }else if(!funcExpr.isAsync()) {
        const start = funcExpr.getStart();
        replacements.push({
            start: start,
            end: start + 8, // "function" の長さ
            text: 'async function'
        });
        hasChanged = true;
    }else if(!funcExpr.isGenerator()) {
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
export const arrowToAsyncGenerator = (expr: Expression<ts.Expression>): boolean => {
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
 * 同一ファイルの置換
 * クラスの中のインスタンスメソッドを
 * AsyncGenerator化する
 * 
 * @param method 
 */
export const methodToAsyncGenerator = function(method: MethodDeclaration){
    const start = method.getStart();
    const _methodCode = method.getText();
    // 最初の"("までの文字数
    const relativeEnd = _methodCode.indexOf('(');
    const name = method.getName();
    replacements.push({
        start: start,
        end: start + relativeEnd,
        text: `async *${name}`
    });
}
/**
 * 別ファイルの置換
 * クラスの中のインスタンスメソッドを
 * AsyncGenerator化する
 * @param method 
 * @param targetFile
 */
export const methodToAsyncGeneratorAnotherFile = function(method: MethodDeclaration, targetFile: SourceFile){
    //console.log('=== 別ファイルの置換 methodToAsyncGeneratorAnotherFile')
    const body = method.getBody();
    if(body){
        //console.log('Body あり')
        const bodyText = body.getText();
        const params = method.getParameters();
        const paramsText = params.map(p => p.getText()).join(', ');
        const methodName = method.getName();
        const _methodName = (methodName)? methodName: '';
        method.replaceWithText(`async *${_methodName} (${paramsText}) ${bodyText}`);
        const replacedId = targetFile.getFilePath()
        const replacedCode = targetFile.getText();
        Cache.MemoryCache.set(replacedId, replacedCode);
        //targetFile.forget(); // 読み込み直し
    }
}

/**
 * 別ファイルの置換
 * functionをAsyncGenerator化する
 * 
 * @param func 
 * @param targetFile 
 */
export const funcToAsyncGeneratorAnotherFile = function(func: FunctionExpression, targetFile: SourceFile) {
    const body = func.getBody();
    if(body){
        const bodyText = body.getText();
        const params = func.getParameters();
        const name = func.getName();
        const funcName = (name)? name: '';
        const paramsText = params.map(p => p.getText()).join(', ');
        func.replaceWithText(`async function* ${funcName}(${paramsText}) ${bodyText}`);
        const replacedId = targetFile.getFilePath();
        const replacedCode = targetFile.getText();
        Cache.MemoryCache.set(replacedId, replacedCode);
        //targetFile.forget(); // 読み込み直し
    }
}
/**
 * 同一ファイルでのArrow-Threadエラー
 * @param func 
 * @param sourceFile 
 */
export const arrowFuncErrorAction = function(id: string, func: ArrowFunction, sourceFile: SourceFile, emitError: EmitErrorWrapper) {
    // 行番号
    const lineNo = func.getStartLineNumber();
    // 列番号 = ノード全体の開始位置 - 行の開始位置 + 1 
    const columnNo = func.getStart() - func.getStartLinePos() + 1;
    // 先にTS-Morphメモリを解放する(エラー表示後のホットリロード時に全コードの整合性を保つ)ために【A】を行う
    // 【A】ts-morph のメモリ解放
    sourceFile.forget();
    const errObj : ErrorObj = {
        message: 'Arrow関数はスレッド化できません[001]',
        id: id,
        loc: { line: lineNo, column: columnNo } // オプション: エラー箇所の行・列
    };
    emitError(errObj);
}
/**
 * 別ファイルの置換時のArrow-Threadエラー処理
 * @param func 
 * @param anotherFile 
 * @param emitError 
 */
export const arrowFuncErrorActionAnotherFile = function(func: ArrowFunction, sourceFile: SourceFile, anotherFile: SourceFile, emitError: EmitErrorWrapper) {
    const anotherFileId = anotherFile.getFilePath();
    //console.log('another file id = ', anotherFileId);
    //const source = func.getSourceFile();
    //console.log(source.getText());
    // 行番号
    const lineNo = func.getStartLineNumber();
    // 列番号 = ノード全体の開始位置 - 行の開始位置 + 1
    const columnNo = func.getStart() - func.getStartLinePos() + 1;
    // 先にTS-Morphメモリを解放する(エラー表示後のホットリロード時に全コードの整合性を保つ)ために【A】を行う
    // 【A】ts-morph のメモリ解放
    //sourceFile.forget();
    anotherFile.forget();
    const errObj : ErrorObj = {
        message: 'Arrow関数はスレッド化できません[002]',
        id: anotherFileId,
        loc: { line: lineNo, column: columnNo }, // オプション: エラー箇所の行・列
        customSend: true,
    };
    emitError(errObj);
}

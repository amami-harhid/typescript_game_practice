import * as ts from 'typescript';
import { ArrowFunction, Expression, Node, SourceFile, SyntaxKind } from "ts-morph";
import { EmitErrorWrapper } from '../../helper.ts';
import * as Replacer from './asyncGeneratoReplacer.ts';
import { tracer } from './tracer.ts';

const finalNodeAction = (id: string, finalNode: Node<ts.Node>, sourceFile: SourceFile, emitError: EmitErrorWrapper) => {
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
                    Replacer.arrowFuncErrorAction(id, arrow, sourceFile, emitError);
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
                    Replacer.arrowFuncErrorActionAnotherFile(arrow, sourceFile, targetFile, emitError );
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
 * 左側の置換処理
 * @param {string} id 対象ファイルのパス
 * @param {Expression<ts.Expression>} rightExpression 左部のExpression 
 * @param {SourceFile} sourceFile 
 * @param {EmitErrorWrapper} emitError 
 * @returns 
 */
export const replacer = (id:string, rightExpression: Expression<ts.Expression>, sourceFile: SourceFile, emitError: EmitErrorWrapper): {hasChanged:boolean, forceError?: boolean} => {
    let hasChanged = false;
    // 右側が『PropertyAccessExpression』のとき
    // クラスインスタンスメソッドまたはリテラルオブジェクトのメソッドの場合が想定される
    if (rightExpression.getKind() === SyntaxKind.PropertyAccessExpression){
        const finalNode = tracer(rightExpression);
        if(finalNode == undefined){
            console.log('finalNode is undefined');
        }
        if(finalNode){
            hasChanged = true;
            const rtn = finalNodeAction(id, finalNode, sourceFile, emitError);
            hasChanged = rtn.hasChanged;
        }
        
    //     const rightPropertyAccess = rightExpression.asKindOrThrow(SyntaxKind.PropertyAccessExpression);

    //     const symbol = rightPropertyAccess.getNameNode().getSymbol();
    //     if (symbol) {
    //         // そのシンボルが定義されている元の宣言（Node）を取得
    //         const declarations = symbol.getDeclarations();

    //         // クラスの MethodDeclaration (メソッド宣言) が見つかる(最初のノードを返す)
    //         const methodDecl = declarations.find(d => d.getKind() === SyntaxKind.MethodDeclaration);
    //         const propertyDecl = declarations.find(d => d.getKind() === SyntaxKind.PropertyAssignment);

    //         // メソッドのとき ( Arrow関数の考慮は不要 )
    //         if (methodDecl && methodDecl.getKind() == SyntaxKind.MethodDeclaration) {
                
    //             const targetFile = methodDecl.getSourceFile();
    //             let isSameSourceFile = true;
    //             if(targetFile != sourceFile) {
    //                 // 宣言が別ファイルのとき
    //                 isSameSourceFile = false;
    //             }
                
                
    //             const _method = methodDecl.asKindOrThrow(SyntaxKind.MethodDeclaration)
                
    //             if(!(_method.isAsync() && _method.isGenerator())) {
    //                 // Async & Generatorでないとき
    //                 if(!isSameSourceFile){
    //                     //console.log('別ファイル')
    //                     Replacer.methodToAsyncGeneratorAnotherFile(_method, targetFile);
    //                 }else{
    //                     Replacer.methodToAsyncGenerator(_method);
    //                     hasChanged = true;
    //                 }
    //             }
    //         }else 
    //         // リテラルオブジェクトのとき ( Arrow関数をかけるので Arrow関数の考慮が必要 )
    //         if (propertyDecl && propertyDecl.getKind()==SyntaxKind.PropertyAssignment) {

    //             const targetFile = propertyDecl.getSourceFile();
    //             let isSameSourceFile = true;
    //             if(targetFile != sourceFile) {
    //                 // 宣言が別ファイルのとき
    //                 isSameSourceFile = false;
    //             }

    //             const _propertyAssgnment = propertyDecl.asKindOrThrow(SyntaxKind.PropertyAssignment)
    //             const right = _propertyAssgnment.getLastChild();

    //             // Functionの場合
    //             if(right && right.getKind()=== SyntaxKind.FunctionExpression){
    //                 const _func = right.asKindOrThrow(SyntaxKind.FunctionExpression);
    //                 if(_func){
    //                     if(isSameSourceFile) {
    //                         hasChanged = Replacer.funcToAsyncGenerator(_func);
    //                         hasChanged = true;

    //                     }else{
    //                         Replacer.funcToAsyncGeneratorAnotherFile(_func, targetFile);
    //                     }
    //                 }
    //             }else 
    //             // アロー関数の場合    
    //             if(right && right.getKind()=== SyntaxKind.ArrowFunction){

    //                 // アロー関数はスレッド化には不適なのでエラーとする
    //                 const func = right.asKindOrThrow(SyntaxKind.ArrowFunction);
    //                 if(isSameSourceFile) {
    //                     Replacer.arrowFuncErrorAction(id, func, sourceFile, emitError);

    //                 }else{
    //                     //console.log(func.getText())
    //                     // アロー関数のとき（かつ他のファイルのとき）エラーにする
    //                     Replacer.arrowFuncErrorActionAnotherFile(func, sourceFile, targetFile, emitError);
    //                     return {hasChanged: false, forceError: true};
    //                 }


    //             }
    //         }
    //     }
    }
    // 右側が「識別子（名前）」(Identifier)のとき
    if (rightExpression.getKind() === SyntaxKind.Identifier) {
        const rightIdentifier = rightExpression.asKindOrThrow(SyntaxKind.Identifier);
        const finalNode = tracer(rightIdentifier);
        if(finalNode == undefined){
            console.log('finalNode is undefined');
        }
        if(finalNode){
            const rtn = finalNodeAction(id, finalNode, sourceFile, emitError);
            hasChanged = rtn.hasChanged;
        }
        // // ts-morphの機能：変数の「定義元（宣言）」を直接取得する
        // const definitions = rightIdentifier.getDefinitions();
        // for (const def of definitions) {
        //     const declarationNode = def.getDeclarationNode();
        //     if (!declarationNode) continue;
        //     const targetFile = declarationNode.getSourceFile();
        //     let isSameSourceFile = true;
        //     if(targetFile != sourceFile) {
        //         // 宣言が別ファイルのとき
        //         isSameSourceFile = false;
        //     }
            
        //     // 変数宣言（const XXX = ...）であるか確認
        //     if (declarationNode.getKind() === SyntaxKind.VariableDeclaration) {
        //         const variableDeclarator = declarationNode.asKindOrThrow(SyntaxKind.VariableDeclaration);
        //         const initializer = variableDeclarator.getInitializer();
        //         if(initializer){
        //             //console.log(SyntaxKind.MethodDeclaration)
        //             // 通常の関数式 (function() {}) の場合
        //             if (initializer.getKind() === SyntaxKind.FunctionExpression) {
        //                 // 宣言が別ファイルのとき
        //                 if(!isSameSourceFile){
        //                     //console.log('別ファイルで 置換')
        //                     const func = initializer.asKindOrThrow(SyntaxKind.FunctionExpression);
        //                     Replacer.funcToAsyncGeneratorAnotherFile(func, targetFile);
        //                 }else{
        //                     //console.log('同一ファイルで funcToAsyncGenerator')
        //                     hasChanged = Replacer.funcToAsyncGenerator(initializer);
        //                 }
        //             } else if (initializer.getKind() === SyntaxKind.ArrowFunction) {
        //                 // もしアロー関数 (async () => {}) だった場合の考慮
        //                 // （アロー関数は generator になれないため、通常の関数式へ変換が必要）
        //                 // アロー関数を async function* () {} の文字列に置き換える
        //                 hasChanged = Replacer.arrowToAsyncGenerator(initializer);
        //             }
        //         }
        //     }
        // }
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
            Replacer.arrowFuncErrorAction(id, func, sourceFile, emitError);
            //hasChanged = arrowToAsyncGenerator(rightExpression);
        }
    } 
    return {hasChanged: hasChanged};

}
import * as ts from 'typescript';
import { Node, SyntaxKind } from "ts-morph";
import * as Helper from '../../helper.ts';

/**
 * スレッドセッターに代入する「ノード」の定義を追跡し
 * PropertyAssignment、PropertyAccessExpression、Identifierで
 * ある間、定義元をたどっていく。
 * 
 * @param {Node<ts.Node>} node 
 * @returns 
 */
export const tracer = (node : Node<ts.Node>) => {
    const startNode = node;
    if (node.getKind() === SyntaxKind.PropertyAccessExpression || node.getKind() === SyntaxKind.Identifier){
        let traceNode = getDefinition(node, startNode);
        const continuedCondition = (node:Node<ts.Node>|undefined) => {
            if(node) {
                return ( 
                    node.getKind()=== SyntaxKind.PropertyAssignment ||
                    node.getKind()=== SyntaxKind.PropertyAccessExpression ||
                    node.getKind()=== SyntaxKind.Identifier
                )
            }else{
                return false;
            }
        }

        let trace = continuedCondition(traceNode)

        while( trace) {
            if(traceNode){
                traceNode = getDefinition(traceNode, startNode);
            }
            trace = continuedCondition(traceNode);
        }
        if(traceNode){
            const targetSourceFile = traceNode.getSourceFile();
            const _isInside = Helper.isInsideTargetSrc(targetSourceFile);
            if(_isInside){
                // Viteルート配下にあるときは 探索したノードを返す
                //console.log("[tracer 001] ", traceNode.getText(), traceNode.getKindName());
                return traceNode;
            // }else{
            //     console.log(node.getText())
            }
        }
    }
    return undefined;
}

/**
 * 
 * @param {Node<ts.Node>} node 
 * @param {Node<ts.Node>} startNode  
 * @returns 
 */
const getDefinition = (node: Node<ts.Node>, startNode: Node<ts.Node>) => {
    if (node.getKind() === SyntaxKind.PropertyAccessExpression){
        const propertyAccessExpression = node.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
        const symbol = propertyAccessExpression.getNameNode().getSymbol();
        if(symbol){
            const declarations = symbol.getDeclarations();
            // MethodDeclarationは基本的に最大１個だけなので find() で取得してよい（例外の補足⇒※１）
            // 例外補足１：　例外事項は無視する
            // 通常のクラス定義において、同じクラス内に同名のメソッドを複数定義することができない
            // しかし抽象クラス（Abstract Class）と派生クラスのメソッドを同じシンボルとして解決した場合、
            // またはクラスの宣言マージ（特定のインターフェースや名前空間とクラスをマージして型を拡張する）
            // の場合には複数の MethodDeclaration が1つのシンボルに紐づくケースがある。
            // 別々のクラスで定義された同名メソッドが、ユニオン型などの交差によって1つのシンボルとして
            // 見なされた場合にも、配列に複数含まれることがある。
            const methodDecls = declarations.filter(d => d.getKind() === SyntaxKind.MethodDeclaration);
            if(methodDecls.length == 1){
                const methodDecl = methodDecls[0];
                if(methodDecl && methodDecl.getKind() == SyntaxKind.MethodDeclaration){
                    return methodDecl;
                }
            }else if(methodDecls.length > 1) {
                const sourceFile = startNode.getSourceFile();
                const id = sourceFile.getFilePath();
                // 行番号
                const lineNo = startNode.getStartLineNumber();
                // 列番号 = ノード全体の開始位置 - 行の開始位置 + 1 
                const columnNo = startNode.getStart() - startNode.getStartLinePos() + 1;
                // エラー
                const errObj: Helper.ErrorObj = {
                    message: "セッター定義が一意に定まるようにコードを見直してください[001]",
                    id: id,
                    loc: {
                        line: lineNo,
                        column: columnNo
                    }, 
                    customSend: true,
                }
                Helper.emitError(errObj);
                Helper.forceErrorObj.forceError = true;
            }
            // const methodDecl = declarations.find(d => d.getKind() === SyntaxKind.MethodDeclaration);
            // if(methodDecl && methodDecl.getKind() == SyntaxKind.MethodDeclaration){
            //     return methodDecl;
            // }

            // PropertyAssignmentは基本的に最大１個だけなので find() で取得してよい（例外の補足⇒※２）
            // 例外補足２： 例外事項は無視する
            // 1つのオブジェクト内に同じキー（プロパティ名）を複数書くことは通常ありえない。
            // (重複して書くと後ろの定義で上書きされるため)
            // 単一のオブジェクトリテラル内を解析している限りはMAX1個である。
            // しかしts-morph の型チェッカー（TypeChecker）経由でシンボルを取得した場合、
            // 異なる場所にある複数のオブジェクトリテラルが、型推論によって1つの共通のプロパティシンボルに
            // 集約されることがある。
            const propertyDecls = declarations.filter(d => d.getKind() === SyntaxKind.PropertyAssignment);
            console.log('propertyDecls.length=', propertyDecls.length, node.getText())
            if(propertyDecls.length == 1){
                const propertyDecl = propertyDecls[0];
                if(propertyDecl && propertyDecl.getKind()==SyntaxKind.PropertyAssignment) {
                    const propertyAssgnment = propertyDecl.asKindOrThrow(SyntaxKind.PropertyAssignment)
                    const right = propertyAssgnment.getLastChild();
                    if(right){
                        if(right.getKind()=== SyntaxKind.FunctionExpression){
                            return right;
                        }
                        if(right.getKind()=== SyntaxKind.ArrowFunction) {
                            return right;
                        }
                        if(right.getKind() === SyntaxKind.PropertyAccessExpression) {
                            //console.log(right.getText(), right.getKindName());
                            return right;
                        }
                        if(right.getKind() === SyntaxKind.Identifier) {
                            //console.log(right.getText(), right.getKindName());
                            return right;                    
                        }
                    }
                }
            }else if(propertyDecls.length > 1) {
                const sourceFile = startNode.getSourceFile();
                const id = sourceFile.getFilePath();
                // 行番号
                const lineNo = startNode.getStartLineNumber();
                // 列番号 = ノード全体の開始位置 - 行の開始位置 + 1 
                const columnNo = startNode.getStart() - startNode.getStartLinePos() + 1;
                // エラー
                const errObj: Helper.ErrorObj = {
                    message: "セッター定義が一意に定まるようにコードを見直してください[002]",
                    id: id,
                    loc: {
                        line: lineNo,
                        column: columnNo
                    }, 
                    customSend: true,
                }
                Helper.emitError(errObj);

                Helper.forceErrorObj.forceError = true;
            }else{
                // symbolで定義元を探索できなかったとき
                console.log("想定外ルート[001] ", node.getText(), node.getKindName());
                const nameNode = propertyAccessExpression.getNameNode()
                const definitions = nameNode.getDefinitionNodes();
                const functionDecls = definitions.filter(
                    d => d.getKind() === SyntaxKind.FunctionExpression || d.getKind() === SyntaxKind.ArrowFunction
                );
                for(const def of definitions) {
                    console.log('def = ', def.getText(), def.getKindName())
                }
                console.log("functionDecls length=", functionDecls.length);
                //const propertyDecl = declarations.find(d => d.getKind() === SyntaxKind.PropertyAssignment);

            }
        }
    }
    if(Helper.forceErrorObj.forceError){
        return;
    }
    if (node.getKind() === SyntaxKind.Identifier) {
        // 右側が identifier
        const identifier = node.asKindOrThrow(SyntaxKind.Identifier);
        const definitions = identifier.getDefinitions();
        for (const def of definitions) {
            // 宣言しているノード
            const declarationNode = def.getDeclarationNode();
            if (!declarationNode) continue;
            if (declarationNode.getKind() === SyntaxKind.VariableDeclaration) {
                // 宣言ノードが変数のとき
                const variableDeclarator = declarationNode.asKindOrThrow(SyntaxKind.VariableDeclaration);
                // 変数に代入している定義を取得
                const initializer = variableDeclarator.getInitializer();
                if(initializer){
                    if (initializer.getKind() === SyntaxKind.FunctionExpression) {
                        //console.log(initializer.getText(), initializer.getKindName());
                        return initializer;
                    }
                    if(initializer.getKind() === SyntaxKind.ArrowFunction) {
                        //console.log(initializer.getText(), initializer.getKindName());
                        return initializer;
                    }
                    if(initializer.getKind() === SyntaxKind.Identifier){
                        //console.log(initializer.getText(), initializer.getKindName());
                        return initializer;
                    }
                    if(initializer.getKind() === SyntaxKind.PropertyAccessExpression){
                        //console.log(initializer.getText(), initializer.getKindName());
                        return initializer;
                    }
                }else{
                    // 代入している定義がない。undefinedである
                    // これはありえない
                    console.log('代入している定義がない。undefinedである')
                }
            }
        }
    }
    console.log("想定外ルート[002] ", node.getText(), node.getKindName());

}
import * as ts from 'typescript';
import { Node, SyntaxKind } from "ts-morph";

export const tracer = (node : Node<ts.Node>) => {
    if (node.getKind() === SyntaxKind.PropertyAccessExpression || node.getKind() === SyntaxKind.Identifier){
        let traceNode = getDefinition(node);
        const continuedCondition = (node:Node<ts.Node>|undefined) => {
            if(node) 
                return ( 
                    node.getKind()=== SyntaxKind.PropertyAssignment ||
                    node.getKind()=== SyntaxKind.PropertyAccessExpression ||
                    node.getKind()=== SyntaxKind.Identifier
                )
            else
                return false;
        }

        let trace = continuedCondition(traceNode)

        while( trace) {
            if(traceNode){
                traceNode = getDefinition(traceNode);
            }
            trace = continuedCondition(traceNode);
        }
        return traceNode;
    }
    return undefined;
}

const getDefinition = (node: Node<ts.Node>) => {
    if (node.getKind() === SyntaxKind.PropertyAccessExpression){
        const propertyAccessExpression = node.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
        const symbol = propertyAccessExpression.getNameNode().getSymbol();
        if(symbol){
            const declarations = symbol.getDeclarations();
            const methodDecl = declarations.find(d => d.getKind() === SyntaxKind.MethodDeclaration);
            if(methodDecl && methodDecl.getKind() == SyntaxKind.MethodDeclaration){
                //console.log(methodDecl.getText(), methodDecl.getKindName());
                return methodDecl;
            }
            const propertyDecl = declarations.find(d => d.getKind() === SyntaxKind.PropertyAssignment);
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
        }
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
    console.log("想定外ルート、", node.getText(), node.getKindName());

}
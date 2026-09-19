import * as ts from 'typescript';
import { Expression, Node, Project, SyntaxKind } from "ts-morph";
import { tracer } from './tracer.ts';

export function transform(code: string, id: string ): void {
    const project = new Project({
            compilerOptions: { target: 99 /* ESNext */ },
            skipAddingFilesFromTsConfig: true, // 高速化
        });
    const sourceFile = project.createSourceFile(id, code, { overwrite: true });    
    const assignments = sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression);
    const tracePropertyAccessExpression = (node: Expression<ts.Expression>) => {
        if (node.getKind() === SyntaxKind.PropertyAccessExpression){
            const propertyAccess = node.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
            const symbol = propertyAccess.getNameNode().getSymbol();
            if (symbol) {
                // そのシンボルが定義されている元の宣言（Node）を取得
                const declarations = symbol.getDeclarations();
                const methodDecl = declarations.find(d => d.getKind() === SyntaxKind.MethodDeclaration);
                const propertyDecl = declarations.find(d => d.getKind() === SyntaxKind.PropertyAssignment);
                if(methodDecl && methodDecl.getKind() == SyntaxKind.MethodDeclaration) {
                    const _method = methodDecl.asKindOrThrow(SyntaxKind.MethodDeclaration)
                    console.log('==== [001]=====')
                    console.log('file path=', _method.getSourceFile().getFilePath());
                    console.log('method context=', _method.getText());
                    console.log('isAsync =', _method.isAsync());
                    console.log('isGenerator =', _method.isGenerator());
                }
                if(propertyDecl && propertyDecl.getKind()==SyntaxKind.PropertyAssignment) {
                    const _propertyAssgnment = propertyDecl.asKindOrThrow(SyntaxKind.PropertyAssignment)
                    console.log('propertyDecl')
                    // 値（右側)
                    const right = _propertyAssgnment.getLastChild();
                    if(right){
                        if(right.getKind()=== SyntaxKind.FunctionExpression){
                            const rightFunc = right.asKindOrThrow(SyntaxKind.FunctionExpression);
                            console.log('==== [002]=====')
                            console.log('file path=', right.getSourceFile().getFilePath());
                            console.log('property context=', right.getText());
                            console.log('FunctionExpression');
                            console.log('isAsync =', rightFunc.isAsync());
                            console.log('isGenerator =', rightFunc.isGenerator());
                        }else if(right.getKind()=== SyntaxKind.ArrowFunction) {
                            const rightArrow = right.asKindOrThrow(SyntaxKind.ArrowFunction);
                            console.log('==== [003]=====')
                            console.log('file path=', right.getSourceFile().getFilePath());
                            console.log('property context=', right.getText());
                            console.log('ArrowFunction');
                            console.log('isAsync =', rightArrow.isAsync());
                        }else if(right.getKind() === SyntaxKind.PropertyAccessExpression) {
                            const propertyAccess = right.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
                            return propertyAccess;
                        }else {
                            console.log('その他 ', right.getKind(), right.getKindName());
                        }
                    }
                }
            }
        }

    }
    const traceLogger = (node: Node<ts.Node> | undefined, text:string) => {
        if( node == undefined) return;
        if (node.getKind() === SyntaxKind.FunctionExpression) {
            const _node = node.asKindOrThrow(SyntaxKind.FunctionExpression);
            console.log(`${text}: path = `, _node.getSourceFile().getFilePath());            
            console.log(`${text}: text = `, _node.getText());
        }else
        if (node.getKind() === SyntaxKind.ArrowFunction) {
            const _node = node.asKindOrThrow(SyntaxKind.ArrowFunction);
            console.log(`${text}: path = `, _node.getSourceFile().getFilePath());            
            console.log(`${text}: text = `, _node.getText());
        }else
        if (node.getKind() === SyntaxKind.MethodDeclaration) {
            const _node = node.asKindOrThrow(SyntaxKind.MethodDeclaration);
            console.log(`${text}: path = `, _node.getSourceFile().getFilePath());            
            console.log(`${text}: text = `, _node.getText());
        }

    }
    for(const assignment of assignments){
        // セッター形式( = )であること
        if (assignment.getOperatorToken().getKind() == SyntaxKind.EqualsToken) {
            
            const leftExpression = assignment.getLeft();
            const rightExpression = assignment.getRight();
            // 左辺が `xxx.Thread.func` のようなプロパティアクセスか確認 
            if (leftExpression.getKind() === SyntaxKind.PropertyAccessExpression) {
                const children = leftExpression.getChildren();
                const func = children[children.length-1]; // xxx.Thread.func のときに 最後のNode(=func)を取り出す
                //console.log('func =', func.getText())
                if(func.getText() != 'func') continue;
                console.log('rightExpression getKindName()=', rightExpression.getKindName())
                // 左側が[Identifier]
                if(func.getKind() == SyntaxKind.Identifier /* (80) */) {
                    console.log('func = ', func.getKindName());
                    // 右側が『PropertyAccessExpression』のとき
                    // これはリテラルオブジェクト、クラスメソッドが該当する
                    if (rightExpression.getKind() === SyntaxKind.PropertyAccessExpression){
                        const finalNode = tracer(rightExpression);
                        traceLogger(finalNode, '');
                    }else
                    // 右側が「識別子（名前）」(Identifier)のとき
                    // これはリテラルオブジェクト、クラスメソッドが該当する
                    if (rightExpression.getKind() === SyntaxKind.Identifier) {
                        const finalNode = tracer(rightExpression);
                        traceLogger(finalNode, '');

                    }else{
                        console.log('rightExpression=', rightExpression.getKindName());
                    }
                }
            }
        }
    }

}
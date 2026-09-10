import * as ts from 'typescript';

import awaitTargetsJson from './awaitTargets.json' with { type: 'json' };
export const getAwaitTargets = (): string[] => {
    const list:string[] = [];
    for(const item of awaitTargetsJson.targets) {
        list.push( item.name );
    }
    return list;
}

export const isAwaitAddTransformerVist = function(node: ts.Node, typeChecker: ts.TypeChecker, targetList:string[]): boolean {
    const _node = node as ts.CallExpression;
    let targetExpression = _node.expression;
    if (ts.isPropertyAccessExpression(_node.expression)) {
        const _name = _node.expression.name.getText();
        if( targetList.includes( _name )) {
            let symbol = typeChecker.getSymbolAtLocation(targetExpression);	
            if (symbol) {
                // エイリアス（インポート）の解決
                let declarationSymbol = symbol;
                if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
                    try {
                        declarationSymbol = typeChecker.getAliasedSymbol(symbol);
                    } catch (e) {}
                }
                                        
                const declarations = declarationSymbol.getDeclarations();
                if (declarations && declarations.length > 0) {
                    let definitionNode = declarations[0] as ts.Node;
                                        
                    // MethodDeclaration まで遡る
                    while (definitionNode && !ts.isMethodDeclaration(definitionNode) && definitionNode.parent) {
                        definitionNode = definitionNode.parent;
                    }
                    if (ts.isMethodDeclaration(definitionNode)) {
                        const defSourceFile = definitionNode.getSourceFile();
                        const defSourceText = defSourceFile.getFullText();
                        const fullStart = definitionNode.getFullStart();
                        const nodeStart = definitionNode.getStart(defSourceFile);
                                        
                        // クラスのメソッド定義の直前コメントを切り出す
                        const leadingText = defSourceText.slice(fullStart, nodeStart);
                        //console.log('leadingText=',leadingText)
                        if (leadingText.includes('@needsAwait')) {
                            // すでに await がついていなければ付与
                            if (node.parent && !ts.isAwaitExpression(node.parent)) {
                                //console.log('await ++++')
                                return true;
                            }
                        }
                    }
                }
            }
        }
    }
    return false;
}
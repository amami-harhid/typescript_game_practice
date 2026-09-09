import * as ts from 'typescript';
import { convertToAsyncGenerator } from '../vite-plugin-ts-code-replacer/transformers/transformer.ts';

export const isAwaitAddTransformerVist = function(node: ts.Node, typeChecker: ts.TypeChecker): boolean {
    const _node = node as ts.CallExpression;
    let targetExpression = _node.expression;
    if (ts.isPropertyAccessExpression(_node.expression)) {
                    if( _node.expression.name.getText() == 'wait' ) {
                        const leftNode = _node.expression.expression; // "sprite.Control" の部分
                        const leftType = typeChecker?.getTypeAtLocation(leftNode);
                        if(leftType)
                            console.log(`[型チェック] ${leftNode.getText()} の型:`, typeChecker.typeToString(leftType));

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
                                            console.log('await ++++')
                                            return true;
                                        }
                                    }
                                }else{
                                    console.log('definitionNode=', definitionNode);
                                }
                                        
                            }else{
                                console.log('declarations=', declarations)
                            }
                        }
                    }
                }
    return false;
}

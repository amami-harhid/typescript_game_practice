import * as ts from 'typescript';
import * as helper from './helper.ts';

export const loopYieldTransformer = (id: string, context: ts.TransformationContext) => {
                return (rootNode: ts.SourceFile) => {

                    function visit(node: ts.Node, inLoop = false): ts.Node {
                        // 繰り返し構文の検知と書き換え
                        if (
                            ts.isForStatement(node) ||
                            ts.isForInStatement(node) ||
                            ts.isForOfStatement(node) ||
                            ts.isWhileStatement(node) ||
                            ts.isDoStatement(node)
                        ) {
                            if (helper.hasSkipComment(node, rootNode)) {
                                return ts.visitEachChild(node, (n) => visit(n, false), context);
                            }
                            const filePath = node.getSourceFile().fileName;
                            //console.log('filePath[3]=', filePath);
                            if(helper.isYieldExcluded(filePath)){
                                //console.log('fileName=',node.getSourceFile().fileName);
                                return ts.visitEachChild(node, (n) => visit(n, false), context);
                            }
                            const [change, loopNewStatement] = helper.loopChange(id, node, visit, inLoop);
                            if(change) {
                                return loopNewStatement;
                            }							
                        }

                        // ループ内の if 文の検知
                        // ループの中にある if文(thenブロック、elseブロック)にて
                        // continue, break文があれば、yieldを付けてブロックを更新する
                        if (inLoop && ts.isIfStatement(node)) {
                            const _node = node as ts.IfStatement;
                            const newThen = helper.transformIfBody(_node.thenStatement, (n) => visit(n, true));
                            if( _node.elseStatement) {
                                const newElse = helper.transformIfBody(_node.elseStatement, (n) => visit(n, true));
                                const ifStatement = ts.factory.updateIfStatement(node, _node.expression, newThen[1], newElse[1]);
                                return ifStatement;
                            }else{
                                const ifStatement = ts.factory.updateIfStatement(node, _node.expression, newThen[1], undefined);
                                return ifStatement;
                            }
                        }				
                        return ts.visitEachChild(node, visit, context);
                    }
                    return ts.visitNode(rootNode, visit) as ts.SourceFile;
                }
            };
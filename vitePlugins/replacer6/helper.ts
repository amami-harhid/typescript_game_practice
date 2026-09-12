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

const convertToAsyncGenerator = function (
    rightExpr: ts.FunctionExpression, 
    visit: (n: ts.Node, inLoop?: boolean) => ts.Node, 
    inLoop: boolean
): ts.FunctionExpression {
    const hasAsync = rightExpr.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword);
    let newModifiers = rightExpr.modifiers || ts.factory.createNodeArray([]);
  
    if (!hasAsync) {
        newModifiers = ts.factory.createNodeArray([
            ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword),
            ...newModifiers
        ]);
    }

    return ts.factory.updateFunctionExpression(
        rightExpr,
        newModifiers,
        ts.factory.createToken(ts.SyntaxKind.AsteriskToken),
        rightExpr.name,
        rightExpr.typeParameters,
        rightExpr.parameters,
        rightExpr.type,
    ts.visitNode(rightExpr.body, (n) => visit(n, inLoop)) as ts.Block
    );
}

type Visit = (node: ts.Node, inLoop?: boolean) => ts.Node;
interface PluginError extends Error {
    loc?: {
        file: string;
        line: number;
        column: number;
    };
    frame?: string;
}

/** 変数定義されたメソッドを async function*() 化する */ 
export const changeAsyncFunction = (node: ts.Node, visit:Visit, inLoop:boolean) : [boolean, ts.Node] => {
    const _node = node as ts.VariableDeclaration;
    if(_node.initializer && ts.isFunctionExpression(_node.initializer)){
        const updatedFunction = convertToAsyncGenerator(_node.initializer, visit, inLoop);
        const variableNode = ts.factory.updateVariableDeclaration(
            _node,
            _node.name,
            _node.exclamationToken,
            _node.type,
            updatedFunction
        );
        //ts.setTextRange(variableNode, _node);
        return [true, variableNode] 

    }
    return [false, node];
}
/** 直接のイベント代入の検知と変換 */
export const directAsyncFunction = (node: ts.Node, visit:Visit, inLoop:boolean): [boolean, ts.Node] => {

    const binaryExpr = node as unknown as  ts.BinaryExpression;
    const rightExpr = binaryExpr.right;
    
    if (ts.isFunctionExpression(rightExpr)) {
        const updatedFunction = convertToAsyncGenerator(rightExpr, visit, inLoop);
        const updateBinaryExpression = ts.factory.updateBinaryExpression(
            binaryExpr,
            binaryExpr.left,
            binaryExpr.operatorToken,
            updatedFunction
        );
        //ts.setTextRange(updateBinaryExpression, node);
        //isModified = true;
        return [true, updateBinaryExpression];
    }else{
        return [false, node];
    }
}

/** yieldを付ける場所 */
const isTarget = (node: ts.Node): boolean => {
    return ts.isBreakStatement(node) || ts.isContinueStatement(node);
}
/** yeild ステートメントを作る */
const createYieldStatement = (): ts.ExpressionStatement => {
    return ts.factory.createExpressionStatement(
        ts.factory.createYieldExpression(undefined, undefined)
    );
}
const transformLoopBody = (
        node: ts.Statement, 
        visit: (n: ts.Node, inLoop?: boolean) => ts.Node, 
        id: string
    ): ts.Statement => {

    const sourceFile = node.getSourceFile();

    if (ts.isBlock(node)) {
        if (node.statements.length === 0) {
            // 空のブロック `{}` のエラー位置を取得
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            const nodeText = node.getText(sourceFile);

            const error = new Error(`Empty loop body detected. Loop statements must not be empty.`) as PluginError;
            error.loc = {
                file: id,
                line: line + 1,
                column: character + 1
            };
            error.frame = nodeText;
            throw error;
        }

        const newStatements: ts.Statement[] = [];
        for (const stmt of node.statements) {
            if (isTarget(stmt)) {
                const yieldStatement = createYieldStatement();
                ts.setTextRange(yieldStatement, node);  // <=== TODO ??? これでいいのかな？

                newStatements.push(createYieldStatement());
            }
            newStatements.push(ts.visitNode(stmt, visit) as ts.Statement);
        }

        const yieldStmt = createYieldStatement();

        const lastStmt = node.statements[node.statements.length - 1];
        const trailingCommentsOfLastStmt = ts.getTrailingCommentRanges(sourceFile.text, lastStmt.end);
    
        const scanStartPos = (trailingCommentsOfLastStmt && trailingCommentsOfLastStmt.length > 0)
            ? trailingCommentsOfLastStmt[trailingCommentsOfLastStmt.length - 1].end
            : lastStmt.end;

        const rawTailText = sourceFile.text.substring(scanStartPos, node.end - 1);

        const commentRegex = /(\/\/.*|\/\*[\s\S]*?\*\/)/g;
        const matches = rawTailText.match(commentRegex);

        if (matches && matches.length > 0) {
            for (const rawComment of matches) {
                const isSingleLine = rawComment.startsWith('//');
                const cleanText = isSingleLine
                    ? rawComment.replace(/^\/\/ ?/, '').trimEnd()
                    : rawComment.replace(/^\/\* ?/, '').replace(/ ?\*\/$/, '').trim();

                ts.addSyntheticLeadingComment(
                    yieldStmt,
                    isSingleLine ? ts.SyntaxKind.SingleLineCommentTrivia : ts.SyntaxKind.MultiLineCommentTrivia,
                    cleanText,
                    true
                );
            }
        }

        newStatements.push(yieldStmt);
        return ts.factory.updateBlock(node, newStatements);
    }

    if (ts.isEmptyStatement(node)) {
        // セミコロンのみ `;` の空ループのエラー位置を取得
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const nodeText = node.getText(sourceFile);

        const error = new Error(`Empty loop body detected. Loop statements must not be empty.`) as PluginError;
        error.loc = {
            file: id,
            line: line + 1,
            column: character + 1
        };
        error.frame = nodeText;
        throw error;
    }

    const newStatements: ts.Statement[] = [];
    if (isTarget(node)) {
        newStatements.push(createYieldStatement());
        newStatements.push(ts.visitNode(node, visit) as ts.Statement);
    } else {
        newStatements.push(ts.visitNode(node, visit) as ts.Statement);
    }

    newStatements.push(createYieldStatement());
    return ts.factory.createBlock(newStatements, true);
}
/** LOOP の置換 */
export const loopChange = (id: string, node: ts.Node, visit:Visit, inLoop:boolean): [boolean, ts.Node] => {
    
    if (ts.isForStatement(node)) {
        const _node = node as ts.ForStatement
        const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
        const forStatement = ts.factory.updateForStatement(node, _node.initializer, _node.condition, _node.incrementor, updatedBody);
        //ts.setTextRange(forStatement, node);
        //isModified = true;
        return [true,forStatement];
    }else if (ts.isForInStatement(node)) {
        const _node = node as ts.ForInStatement
        const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
        const forInStatemnet = ts.factory.updateForInStatement(node, _node.initializer, _node.expression, updatedBody);
        //ts.setTextRange(forInStatemnet, node);
        //isModified = true;
        return [true, forInStatemnet];
    }else if (ts.isForOfStatement(node)) {
        const _node = node as ts.ForOfStatement;
        const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
        const forOfStatement = ts.factory.updateForOfStatement(node, _node.awaitModifier, _node.initializer, _node.expression, updatedBody);
        //ts.setTextRange(forOfStatement, node);
        //isModified = true;
        return [true, forOfStatement];
    }else if (ts.isWhileStatement(node)) {
        const _node = node as ts.WhileStatement;
        const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
        const whileStatement = ts.factory.updateWhileStatement(node, _node.expression, updatedBody);
        //ts.setTextRange(whileStatement, node);
        //isModified = true;
        return [true, whileStatement];
    }else if (ts.isDoStatement(node)) {
        const _node = node as ts.DoStatement;
        const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
        const doStatement = ts.factory.updateDoStatement(node, updatedBody, _node.expression);
        //ts.setTextRange(doStatement, node);
        //isModified = true;
        return [true, doStatement];
    }
    return [false, node];
}

const transformIfBody = ( node: ts.Statement, visit: Visit): [boolean, ts.Statement] => {
    if (ts.isBlock(node)) {
        const newStatements: ts.Statement[] = [];
        let updateFlg = false;
        for (const stmt of node.statements) {
            if (isTarget(stmt)) {
                newStatements.push(createYieldStatement());
                updateFlg = true;
            }
            newStatements.push(ts.visitNode(stmt, visit) as ts.Statement);
        }
        if(updateFlg){
            return [true, ts.factory.updateBlock(node, newStatements)];
        }
    } else {
        if (isTarget(node)) {
            return [true, ts.factory.createBlock([createYieldStatement(), ts.visitNode(node, visit) as ts.Statement], true)];
        }
    }
    return [false, node];
}

import ts from 'typescript';
import { isTarget, createYieldStatement, hasSkipComment, isTargetEventAssignment, isAwaitTargetCallWithComment } from '../utils/plugins-helpers.ts';

export interface PluginError extends Error {
    loc?: {
        file: string;
        line: number;
        column: number;
    };
    frame?: string;
}

// 繰り返し構文の「本体（Body）」を書き換えるメイン処理
function transformLoopBody(
    node: ts.Statement, 
    visit: (n: ts.Node, inLoop?: boolean) => ts.Node, 
    id: string
): ts.Statement {

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

function transformIfBody(
    node: ts.Statement, 
    visit: (n: ts.Node, inLoop?: boolean) => ts.Node
): ts.Statement {
    if (ts.isBlock(node)) {
        const newStatements: ts.Statement[] = [];
        for (const stmt of node.statements) {
            if (isTarget(stmt)) {
                newStatements.push(createYieldStatement());
            }
            newStatements.push(ts.visitNode(stmt, visit) as ts.Statement);
        }
        return ts.factory.updateBlock(node, newStatements);
    } else {
        if (isTarget(node)) {
            return ts.factory.createBlock([createYieldStatement(), ts.visitNode(node, visit) as ts.Statement], true);
        }
        return ts.factory.createBlock([ts.visitNode(node, visit) as ts.Statement], true);
    }
}

function convertToAsyncGenerator(
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

export const createTransformer = (id: string, context: ts.TransformationContext, typeChecker: ts.TypeChecker): ts.Transformer<ts.SourceFile> => {
    return (sf: ts.SourceFile) => {
    
        const targetVariableNames = new Set<string>();

        function preScan(node: ts.Node): void {
            if (isTargetEventAssignment(node)) {
                const binaryExpr = node as ts.BinaryExpression;
                if (ts.isIdentifier(binaryExpr.right)) {
                    targetVariableNames.add(binaryExpr.right.text);
                }
            }
            ts.forEachChild(node, preScan);
        }
        preScan(sf);

        function visit(node: ts.Node, inLoop = false): ts.Node {

            // isAwaitTargetCallWithCommentの引数を typeChecker とした
            if (isAwaitTargetCallWithComment(node, typeChecker) && node.parent && !ts.isAwaitExpression(node.parent)) {
                // 先に子ノード（引数など）の内部変換を再帰処理したノードを作成
                const visitedCall = ts.visitEachChild(node, (n) => visit(n, inLoop), context) as ts.CallExpression;
                // それを await 演算子で包んで返す
                return ts.factory.createAwaitExpression(visitedCall);
            }

            // 変数宣言文の検知と変換
            if (ts.isVariableDeclaration(node) && node.initializer && ts.isFunctionExpression(node.initializer)) {
                if (ts.isIdentifier(node.name) && targetVariableNames.has(node.name.text)) {
                    const updatedFunction = convertToAsyncGenerator(node.initializer, visit, inLoop);
                    return ts.factory.updateVariableDeclaration(
                        node,
                        node.name,
                        node.exclamationToken,
                        node.type,
                        updatedFunction
                    );
                }
            }

            // 直接のイベント代入の検知と変換
            if (isTargetEventAssignment(node)) {
                const binaryExpr = node as ts.BinaryExpression;
                const rightExpr = binaryExpr.right;

                if (ts.isFunctionExpression(rightExpr)) {
                    const updatedFunction = convertToAsyncGenerator(rightExpr, visit, inLoop);
                    return ts.factory.updateBinaryExpression(
                        binaryExpr,
                        binaryExpr.left,
                        binaryExpr.operatorToken,
                        updatedFunction
                    );
                }
            }

            // 繰り返し構文の検知と書き換え
            if (
                ts.isForStatement(node) ||
                ts.isForInStatement(node) ||
                ts.isForOfStatement(node) ||
                ts.isWhileStatement(node) ||
                ts.isDoStatement(node)
            ) {
                if (hasSkipComment(node, sf)) {
                    return ts.visitEachChild(node, (n) => visit(n, false), context);
                }

                if (ts.isForStatement(node)) {
                    const updatedBody = transformLoopBody(node.statement, (n) => visit(n, true), id);
                    return ts.factory.updateForStatement(node, node.initializer, node.condition, node.incrementor, updatedBody);
                }
                if (ts.isForInStatement(node)) {
                    const updatedBody = transformLoopBody(node.statement, (n) => visit(n, true), id);
                    return ts.factory.updateForInStatement(node, node.initializer, node.expression, updatedBody);
                }
                if (ts.isForOfStatement(node)) {
                    const updatedBody = transformLoopBody(node.statement, (n) => visit(n, true), id);
                    return ts.factory.updateForOfStatement(node, node.awaitModifier, node.initializer, node.expression, updatedBody);
                }
                if (ts.isWhileStatement(node)) {
                    const updatedBody = transformLoopBody(node.statement, (n) => visit(n, true), id);
                    return ts.factory.updateWhileStatement(node, node.expression, updatedBody);
                }
                if (ts.isDoStatement(node)) {
                    const updatedBody = transformLoopBody(node.statement, (n) => visit(n, true), id);
                    return ts.factory.updateDoStatement(node, updatedBody, node.expression);
                }
            }

            // ループ内の if 文の検知
            if (inLoop && ts.isIfStatement(node)) {
                const newThen = transformIfBody(node.thenStatement, (n) => visit(n, true));
                const newElse = node.elseStatement ? transformIfBody(node.elseStatement, (n) => visit(n, true)) : undefined;
                return ts.factory.updateIfStatement(node, node.expression, newThen, newElse);
            }

            return ts.visitEachChild(node, (n) => visit(n, inLoop), context);
        }
        return ts.visitNode(sf, (n) => visit(n, false)) as ts.SourceFile;
    };
};
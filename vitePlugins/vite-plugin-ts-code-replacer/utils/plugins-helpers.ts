import ts from 'typescript';
import { AWAIT_TARGET_METHODS } from './await-target-set.ts';
import { LOOP_YIELD_SKIP_COMMENT } from './loopYieldSkipMark.ts';

export function isTarget(node: ts.Node): boolean {
    return ts.isBreakStatement(node) || ts.isContinueStatement(node);
}

export function createYieldStatement(): ts.ExpressionStatement {
    return ts.factory.createExpressionStatement(
        ts.factory.createYieldExpression(undefined, undefined)
    );
}

export function hasSkipComment(node: ts.Node, sourceFile: ts.SourceFile): boolean {
    const leadingComments = ts.getLeadingCommentRanges(sourceFile.text, node.pos);
    if (!leadingComments) return false;

    for (const commentRange of leadingComments) {
        const commentText = sourceFile.text.substring(commentRange.pos, commentRange.end);
        if (commentText.includes( LOOP_YIELD_SKIP_COMMENT )) {
            return true;
        }
    }
    return false;
}

export function isTargetEventAssignment(node: ts.Node): boolean {

    // Setter "=" でないとき
    if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
        return false;
    }

    // 左側 が "func"でないとき
    const left = node.left;
    if (!ts.isPropertyAccessExpression(left) || left.name.text !== 'func') {
        return false;
    }

    let expr = left.expression;
    if (ts.isCallExpression(expr)) {
        expr = expr.expression;
    }

    if (ts.isPropertyAccessExpression(expr)) {
        //const parentExpr = expr.expression;
        if (ts.isPropertyAccessExpression(expr)) {
            const categoryName = expr.name.text;
            if (categoryName === 'Thread') {
                return true;
            }
        }
    }

    return false;
}

/**
 * ノードが await 付与対象のメソッド呼び出しであるか判定する
 */
export function isAwaitTargetCall(node: ts.Node): boolean {
    if (!ts.isCallExpression(node)) {
        return false;
    }

    // 呼び出し元の表現式（this.Control.wait など）を解析
    let expr = node.expression;
    const parts: string[] = [];

    // プロパティアクセスを遡ってパーツを配列に格納する
    while (ts.isPropertyAccessExpression(expr)) {
        parts.unshift(expr.name.text);
        expr = expr.expression;
    }

    // 先頭のオブジェクト名（XXX または this など）を除いた残りのパスを結合
    // 例: ["Control", "wait"] -> "Control.wait"
    const methodPath = parts.join('.');
    return AWAIT_TARGET_METHODS.has(methodPath);
}

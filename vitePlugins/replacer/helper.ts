import * as ts from 'typescript';
import awaitTargetsJson from './awaitTargets.json' with { type: 'json' };
import { LOOP_YIELD_SKIP_COMMENT } from './loopYieldSkipMark.ts';
import { minimatch } from 'minimatch';
import yieldExcludesJson from './yieldExcludes.json' with { type: 'json' };

/**
 * yield付与の非対象のファイルパスかを判定する
 * @param {string} filePath - チェック対象のファイルパス
 * @returns {boolean} 非対象であれば true、そうでなければ false
 */
export function isYieldExcluded(filePath: string): boolean {
    // 「～～/lib/...」のように前方に任意の文字を許容したい場合は、
    // パターンの先頭に `**` があるとします。
    const isEcclude = yieldExcludesJson.exclude.some(pattern=>{
        return minimatch(filePath, pattern);
    });
    // 対象外にヒットしたときは true を返す
    return isEcclude;
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


export const getAwaitTargets = (): [string[], string[] ] => {
    const list:string[] = [];
    const listFull:string[] = [];
    for(const item of awaitTargetsJson.targets) {
        list.push( item.name );
        listFull.push( item.fullName );
    }
    return [list, listFull];
}

const [_, awaitTargetFullMethods] = getAwaitTargets();

/**
 * Async Generator関数にする
 * @param rightExpr 
 * @param visit 
 * @param inLoop 
 * @returns 
 */
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
            // if (isTarget(stmt)) {
            //     const yieldStatement = createYieldStatement();
            //     newStatements.push(yieldStatement);
            // }
            newStatements.push(ts.visitNode(stmt, visit) as ts.Statement);
        }

        const yieldStmt = createYieldStatement();

        const lastStmt = node.statements[node.statements.length - 1];
        let isExitsyield = false;
        const lastStatementExpression = (lastStmt as ts.ExpressionStatement).expression;
        if(ts.isYieldExpression(lastStatementExpression)) {
            console.log('Last statement is yield')
            isExitsyield = true;
        } 
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
        if(isExitsyield === false){
            newStatements.push(yieldStmt);
        }
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

export const transformIfBody = ( node: ts.Statement, visit: Visit): [boolean, ts.Statement] => {
    if (ts.isBlock(node)) {
        const newStatements: ts.Statement[] = [];
        let updateFlg = false;
        let prevStatement: ts.Statement | null = null;
        for (const stmt of node.statements) {
            if (isTarget(stmt)) {
                // statement が break, continueのとき 
                if(prevStatement){
                    const prev = prevStatement as ts.ExpressionStatement;
                    if(!ts.isYieldExpression(prev.expression)) {
                        // 直前が yield でないとき
                        newStatements.push(createYieldStatement());
                    }
                }else{
                    // 直前がないとき
                    newStatements.push(createYieldStatement());
                }
                updateFlg = true;
            }
            newStatements.push(ts.visitNode(stmt, visit) as ts.Statement);
            prevStatement = stmt;
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

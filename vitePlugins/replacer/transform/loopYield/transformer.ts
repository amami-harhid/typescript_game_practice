import * as ts from 'typescript';
import * as Helper from '../../helper.ts';
import type { ErrorObj } from '../../helper.ts';

type Visit = (node: ts.Node, inLoop?: boolean) => ts.Node;

interface PluginError extends Error {
    loc?: {
        file: string;
        line: number;
        column: number;
    };
    frame?: string;
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
/**
 * 繰返しのブロックの中の置換処理
 * @param id 
 * @param node 
 * @param visit 
 * @returns 
 */
const transformLoopBody = (
        id: string,
        node: ts.Statement, 
        visit: (n: ts.Node, inLoop?: boolean) => ts.Node, 
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
            newStatements.push(ts.visitNode(stmt, visit) as ts.Statement);
        }

        const yieldStmt = createYieldStatement();

        const lastStmt = node.statements[node.statements.length - 1];
        let isExitsyield = false;
        const lastStatementExpression = (lastStmt as ts.ExpressionStatement).expression;
        if(ts.isYieldExpression(lastStatementExpression)) {
            //console.log('Last statement is yield')
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
/**
 * LOOP の置換
 * ブロックの最後に yield をつける
 */
const loopChange = (id: string, node: ts.Node, visit:Visit): [boolean, ts.Node] => {
    
    if (ts.isForStatement(node)) {
        const _node = node as ts.ForStatement
        const updatedBody = transformLoopBody(id, _node.statement, (n) => visit(n, true));
        const forStatement = ts.factory.updateForStatement(node, _node.initializer, _node.condition, _node.incrementor, updatedBody);
        return [true,forStatement];
    }else if (ts.isForInStatement(node)) {
        const _node = node as ts.ForInStatement
        const updatedBody = transformLoopBody(id, _node.statement, (n) => visit(n, true));
        const forInStatemnet = ts.factory.updateForInStatement(node, _node.initializer, _node.expression, updatedBody);
        return [true, forInStatemnet];
    }else if (ts.isForOfStatement(node)) {
        const _node = node as ts.ForOfStatement;
        const updatedBody = transformLoopBody(id, _node.statement, (n) => visit(n, true));
        const forOfStatement = ts.factory.updateForOfStatement(node, _node.awaitModifier, _node.initializer, _node.expression, updatedBody);
        return [true, forOfStatement];
    }else if (ts.isWhileStatement(node)) {
        const _node = node as ts.WhileStatement;
        const updatedBody = transformLoopBody(id, _node.statement, (n) => visit(n, true));
        const whileStatement = ts.factory.updateWhileStatement(node, _node.expression, updatedBody);
        return [true, whileStatement];
    }else if (ts.isDoStatement(node)) {
        const _node = node as ts.DoStatement;
        const updatedBody = transformLoopBody(id, _node.statement, (n) => visit(n, true));
        const doStatement = ts.factory.updateDoStatement(node, updatedBody, _node.expression);
        return [true, doStatement];
    }
    return [false, node];
}

/**
 * if文/else文の中に continue,break があれば、直前に yieldをつける
 * yieldをつけるときは { }がないときは { }をつける
 * なお、ループの中で呼び出される前提である
 * @param node 
 * @param visit 
 * @returns 
 */
const transformIfBody = ( node: ts.Statement, visit: Visit): [boolean, ts.Statement] => {
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

/**
 * ループ処理ブロックの末尾にyield行を追加、break,continueの直前にyield行を追加する。
 * yieldを追加するとき直近の親関数がAsyncGenerator関数でない場合はエラーにする。
 * 
 * @param {string} id ファイルパス 
 * @param {ts.TransformationContext} context コード 
 * @returns 
 */
export const transform = (
    id: string, 
    context: ts.TransformationContext,
) => {
    return (rootNode: ts.SourceFile) => {
        function visit(node: ts.Node, inLoop = false): ts.Node {
            if(Helper.forceErrorObj.forceError){
                return node;
            }
            // 繰り返し構文の検知と書き換え
            if (
                ts.isForStatement(node) ||
                ts.isForInStatement(node) ||
                ts.isForOfStatement(node) ||
                ts.isWhileStatement(node) ||
                ts.isDoStatement(node)
                ) {
                if (Helper.hasSkipComment(node, rootNode)) {
                    return ts.visitEachChild(node, (n) => visit(n, false), context);
                }
                const filePath = node.getSourceFile().fileName;
                if(Helper.isYieldExcluded(filePath)){
                    return ts.visitEachChild(node, (n) => visit(n, false), context);
                }
                // エラーターゲットノードを取り出す(親関数がないときはループノード、あるときは親関数ノード)
                let errorTargetNode: ts.Node|undefined = undefined;
                const parent = Helper.findParentFunction(node);
                if( parent == undefined){
                    errorTargetNode = node; // ループのノード
                }else if( !Helper.isGenerator(parent) && !Helper.isAsyncGenerator(parent)) {
                    errorTargetNode = parent; // 親関数
                }
                if(errorTargetNode && parent == undefined){
                    const info = Helper.getTsNodeLocation(errorTargetNode);
                    const errObj: ErrorObj = {
                        message: 'Generator関数でない中でyieldを付与できません[001]',
                        id: id,
                        loc: { line: info.line, column: info.column }, // オプション: エラー箇所の行・列
                        customSend : true,
                    }
                    Helper.emitError(errObj);
                    //console.log('==== after emitError[001] ====', id);
                    //Helper.forceErrorObj.forceError = true;
                    //throw new Helper.YieldError('Generator関数でない中でyieldを付与できません[002]', errorTargetNode)
                }
                if(parent){
                    // 親関数が generator/asyncGeneratorでないときはエラーとする
                    if( !Helper.isGenerator(parent) && !Helper.isAsyncGenerator(parent)) {
                        const info = Helper.getTsNodeLocation(parent);
                        const errObj: ErrorObj = {
                            message: 'Generator関数でない中でyieldを付与できません[002]',
                            id: id,
                            loc: { line: info.line, column: info.column }, // オプション: エラー箇所の行・列
                            customSend : true,
                        }
                        Helper.emitError(errObj);
                        //console.log('==== after emitError[002] ====', id, parent.getText());
                        //Helper.forceErrorObj.forceError = true;
                        //throw new Helper.YieldError('Generator関数でない中でyieldを付与できません[002]', parent)
                    }
                }
                if(Helper.forceErrorObj.forceError){
                    return node;
                }
                const [change, loopNewStatement] = loopChange(id, node, visit);
                if(change) {
                    return loopNewStatement;
                }							
            }

            // ループ内の if 文の検知
            // ループの中にある if文(thenブロック、elseブロック)にて
            // continue, break文があれば、yieldを付けてブロックを更新する
            // inLoop==trueのときはループがGenerator関数内にあることを保証されているため
            // Generator関数内に存在することをチェックしなくてもよい。
            if (inLoop && ts.isIfStatement(node)) { // inLoop==true のときは ループ内にあることを示している
                const _node = node as ts.IfStatement;
                const newThen = transformIfBody(_node.thenStatement, (n) => visit(n, true));
                if( _node.elseStatement) {
                    // elseステートメントがあるとき
                    const newElse = transformIfBody(_node.elseStatement, (n) => visit(n, true));
                    const ifStatement = ts.factory.updateIfStatement(node, _node.expression, newThen[1], newElse[1]);
                    return ifStatement;
                }else{
                    // elseステートメントがないとき
                    const ifStatement = ts.factory.updateIfStatement(node, _node.expression, newThen[1], undefined);
                    return ifStatement;
                }
            }				
            return ts.visitEachChild(node, visit, context);
        }
        return ts.visitNode(rootNode, visit) as ts.SourceFile;
    }
};
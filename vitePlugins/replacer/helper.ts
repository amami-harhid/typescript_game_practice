import * as ts from 'typescript';
import awaitTargetsJson from './awaitTargets.json' with { type: 'json' };
import { LOOP_YIELD_SKIP_COMMENT } from './loopYieldSkipMark.ts';
import { minimatch } from 'minimatch';
import yieldExcludesJson from './yieldExcludes.json' with { type: 'json' };
import targetIdsJson from './targetIds.json' with { type: 'json'};
import path from 'path';

const inMemoryCache = new Map<string, string>();
const inMemoryCacheUpdate = new Map<string, boolean>();

export class MemoryCache {
    static clear() {
        console.log('==== MemoryCach.clear');                
        inMemoryCache.clear();
        inMemoryCacheUpdate.clear();
    }
    static has(id: string): boolean {
        const normFileName = path.normalize(id).replace(/\\/g, '/');
        return inMemoryCache.has(normFileName)
    }
    static get(id: string): string {
        const normFileName = path.normalize(id).replace(/\\/g, '/');
        if(inMemoryCache.has(normFileName)){
            const code = inMemoryCache.get(normFileName);
            if(id == 'D:/Scratch3/ts/typescript_game_practice/src/testV2/010/sub/threads.ts'){
                console.log('==== MemoryCach.get','\n==== id=',id, '\n==== code=\n',code);
            }
            return code!;
        }
        else
            return '';
    }
    static set(id: string, code: string, innerReplaced:boolean = false): void {
        if(id == 'D:/Scratch3/ts/typescript_game_practice/src/testV2/010/sub/threads.ts'){
            console.log('==== MemoryCach.set','\n==== id=',id, '\n==== code=',code);        
        }
        const normFileName = path.normalize(id).replace(/\\/g, '/');
        if(innerReplaced === true){
            // 置換処理から書き込む
            inMemoryCache.set(normFileName, code);
            inMemoryCacheUpdate.set(normFileName, true);
        }else{
            // 実ファイルから取り出そうとする
            const updated = inMemoryCacheUpdate.get(normFileName);
            if( updated === true) {

            } else {
                inMemoryCache.set(normFileName, code);
                inMemoryCacheUpdate.set(normFileName, true);
            }
        }

    }
    static remove(id: string) {
        const normFileName = path.normalize(id).replace(/\\/g, '/');
        if(inMemoryCache.has(normFileName)) {
            inMemoryCache.delete(normFileName);
        }
    }
}

/**
 * 置換非対象の id ( = path ) を判定する
 * @param id 
 * @returns 
 */
export function isTargetIdExcluded(id: string): boolean {
    const isExclude = targetIdsJson.exclude.some(pattern=>{
        return minimatch(id, pattern);
    })
    return isExclude; // 1個でもヒットすればTrue
}

/**
 * yield付与の非対象のファイルパスかを判定する
 * @param {string} filePath - チェック対象のファイルパス
 * @returns {boolean} 非対象であれば true、そうでなければ false
 */
export function isYieldExcluded(filePath: string): boolean {
    // 「～～/lib/...」のように前方に任意の文字を許容したい場合は、
    // パターンの先頭に `**` があるとします。
    const isExclude = yieldExcludesJson.exclude.some(pattern=>{
        return minimatch(filePath, pattern);
    });
    // 対象外にヒットしたときは true を返す
    return isExclude;
} 

/**
 * ループの前に「スキップコメント」があるかを判定する
 * @param node 
 * @param sourceFile 
 * @returns 
 */
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

/**
 * await を付与するメソッド名を配列化して返す。
 * @returns 
 */
export const getAwaitTargets = (): [string[], string[] ] => {
    const list:string[] = [];
    const listFull:string[] = [];
    for(const item of awaitTargetsJson.targets) {
        list.push( item.name );
        listFull.push( item.fullName );
    }
    return [list, listFull];
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
 * @param node 
 * @param visit 
 * @param id 
 * @returns 
 */
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
/**
 * LOOP の置換
 * ブロックの最後に yield をつける
 */
export const loopChange = (id: string, node: ts.Node, visit:Visit, inLoop:boolean): [boolean, ts.Node] => {
    
    if (ts.isForStatement(node)) {
        const _node = node as ts.ForStatement
        const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
        const forStatement = ts.factory.updateForStatement(node, _node.initializer, _node.condition, _node.incrementor, updatedBody);
        return [true,forStatement];
    }else if (ts.isForInStatement(node)) {
        const _node = node as ts.ForInStatement
        const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
        const forInStatemnet = ts.factory.updateForInStatement(node, _node.initializer, _node.expression, updatedBody);
        return [true, forInStatemnet];
    }else if (ts.isForOfStatement(node)) {
        const _node = node as ts.ForOfStatement;
        const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
        const forOfStatement = ts.factory.updateForOfStatement(node, _node.awaitModifier, _node.initializer, _node.expression, updatedBody);
        return [true, forOfStatement];
    }else if (ts.isWhileStatement(node)) {
        const _node = node as ts.WhileStatement;
        const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
        const whileStatement = ts.factory.updateWhileStatement(node, _node.expression, updatedBody);
        return [true, whileStatement];
    }else if (ts.isDoStatement(node)) {
        const _node = node as ts.DoStatement;
        const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
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

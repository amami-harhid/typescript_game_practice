import * as ts from 'typescript';

import { LOOP_YIELD_SKIP_COMMENT } from './TagMarks.ts';
import { minimatch } from 'minimatch';
import yieldExcludesJson from './yieldExcludes.json' with { type: 'json' };
import targetIdsJson from './targetIds.json' with { type: 'json'};

export type ErrorObj = { message: string; id?: string; loc?: { line: number; column: number } };

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

import awaitTargetsJson from './awaitTargets.json' with { type: 'json' };
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




import * as ts from 'typescript';

import { LOOP_YIELD_SKIP_COMMENT } from './TagMarks.ts';
import { minimatch } from 'minimatch';
import yieldExcludesJson from './json/yieldExcludes.json' with { type: 'json' };
import targetIdsJson from './json/targetIds.json' with { type: 'json'};
import awaitTargetsJson from './json/awaitTargets.json' with { type: 'json' };

export type ErrorObj = { message: string; id?: string; loc?: { line: number; column: number } };

/**
 * 指定したノードを囲んでいる最寄りの親関数ノードを返す
 */
export const findParentFunction = function (node: ts.Node): ts.FunctionLikeDeclaration | undefined {
    let current: ts.Node | undefined = node.parent;

    while (current) {
        // 関数宣言、関数式、アロー関数、メソッド宣言などをまとめて判定
        if (ts.isFunctionLike(current)) {
            return current as ts.FunctionLikeDeclaration;
        }
        current = current.parent;
    }

    return undefined;
}

/** Generator関数（function*）であるかの判定 */
export const isGenerator = function (node: ts.FunctionLikeDeclaration): boolean {
  // アロー関数やコンストラクタなど、asteriskToken を持ち得ないノードを除外
  if ("asteriskToken" in node && node.asteriskToken) {
    return true;
  }
  return false;
}

/** Async Generator関数（async function*）であるかの判定 */
export const isAsyncGenerator = function (node: ts.FunctionLikeDeclaration): boolean {
  // function* (Generator) であることが大前提
  if (!isGenerator(node)) return false;

  // かつ、modifiers に `async` キーワードが含まれているか
  return hasAsyncModifier(node);
}

/** 補助関数: async 修飾子を持っているかチェック */ 
const hasAsyncModifier = function (node: ts.Node): boolean {
  // TypeScript 5.0以降の推奨スタイル（canHaveModifiers + getModifiers）
  if (ts.canHaveModifiers(node)) {
    const modifiers = ts.getModifiers(node);
    return modifiers?.some(mod => mod.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
  }
  return false;
}

/**
 * 指定したノードの開始位置（行・列）を取得する
 * @returns 1から始まる行番号とカラム位置（1-indexed）
 */
export const getTsNodeLocation = function (node: ts.Node): {line:number, column: number} {
  // 1. ノードが属する SourceFile を取得
  const sourceFile = node.getSourceFile();
  if (!sourceFile) {
    throw new Error("SourceFileが見つかりません。ASTパース時に親ノード情報を保持させてください。");
  }

  // 2. ノードの開始位置（文字数カウントの絶対位置）を取得
  const startPosition = node.getStart(sourceFile);

  // 3. 絶対位置を行・列のオブジェクトに変換（内部的には 0-indexed）
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(startPosition);

  return {
    // 表示用に 1 を足して 1-indexed に変換
    line: line + 1,
    column: character + 1,
  };
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




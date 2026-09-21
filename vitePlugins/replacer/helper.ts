import * as ts from 'typescript';

//import { LOOP_YIELD_SKIP_TAG } from './TagMarks.ts';
import { minimatch } from 'minimatch';
import yieldExcludesJson from './json/yieldExcludes.json' with { type: 'json' };
import targetIdsJson from './json/targetIds.json' with { type: 'json'};
import { ViteDevServer, ResolvedConfig, normalizePath } from 'vite';
import { SourceFile } from 'ts-morph';
import fs from 'fs'; 

type ForceErrorObj = {forceError: boolean};
export const forceErrorObj: ForceErrorObj = {
    forceError: false
};

export const YieldError = class extends Error {
    private _node: ts.Node;
    constructor(message: string, node: ts.Node) {
        super(message);
        this.name = 'YieldError';
        this._node = node;
    }
    get node() {
        return this._node;
    }
}

/** スレッドセッター*/
export interface TargetThreadSetter {
	targets?: string[],
    targetsRegExp?: {pattern: string, flags?: string}[],
}
/** タグマーク */
export interface TagMarks {
	LOOP_YIELD_SKIP_TAG: string,
	THREAD_SETTER_TAG: string,
	NEEDS_AWAIT_METHOD_TAG: string,
}
/** Await対象タグ */
export interface TagAwait {
	targets: {names: string[], fullNames: string[]},
    targetsRegExp?: {pattern: string, flags?: string}[],
}


type JsonDataObj = {targetThreadSetter: TargetThreadSetter, tagMarks: TagMarks, tagAwait: TagAwait};
/** JSONデータ保有オブジェクト */
export const jsonDataObj: JsonDataObj = {
	targetThreadSetter: {},
	tagMarks: {LOOP_YIELD_SKIP_TAG:"", THREAD_SETTER_TAG:"", NEEDS_AWAIT_METHOD_TAG:""},
	tagAwait: {targets: {names:[''], fullNames:['']}},
}

type RegexpObj = {regexThreadSetter: RegExp[], regexAwait: RegExp[]};
/** Regex 保有オブジェクト */
export const regexpObj: RegexpObj = {
    regexThreadSetter: [],
    regexAwait: []
}

export type ErrorObj = { message: string; id: string; loc: { file?: string, line: number; column: number }, customSend?: boolean };
export type EmitErrorWrapper = (errObj : ErrorObj) => void;
export type ClearCache = (id: string) => void;
//export type ClearCache2 = (id: string, server: ViteDevServer) => void;

export type IsInsideTarget = (targetSourceFile: SourceFile) => boolean


/** 
 * キャッシュを強制クリアするヘルパー関数
 * TSコードを修正保存するときホットリロードされるが
 * 関連するファイル全てについて置換処理（１段目、２段目、３段目）のやり直しを
 * させたい。エラー発生したときにはキャッシュ強制クリアをペアで行うものとする
 * @param {string} id
 */ 
export const clearCache: ClearCache = (id: string) => {
	const server = ServerObj.server;
	if (server) {
		const moduleNode = server.moduleGraph.getModuleById(id);
		if (moduleNode) {
			// モジュールグラフからこのファイルのキャッシュを無効化
			server.moduleGraph.invalidateModule(moduleNode);
		}
	}
}

/** ファイルパスごとの最終エラー時刻を記録するMap */
export const lastErrorOverlayCache = new Map<string, number>();

/**
 * エラー発生時のラッパー関数
 * Viteの開発サーバー（HMR）の二重ロード仕様によるエラーメッセージ２重呼出しを回避させる意図で
 * 用意したエラーラッパー関数です。
 * 
 * 開発時には「プリトランスパイル（Pre-transform）」と
 * 「実際のモジュール構築（Internal server/Bundle）」の２つのフェーズで
 * transformフックが呼び出されます。
 * そのため、２回連続でエラーが起こることになり少々目障り感があります。
 * 短い間隔でエラーが起きる場合は、２回目のエラー表示を無視するようにします。
 */ 
export const emitError: EmitErrorWrapper = (errObj: ErrorObj) => {
    
    forceErrorObj.forceError = true;

    const errorTargetId = errObj.id;
    const now = Date.now();
    const lastErrorTime = lastErrorOverlayCache.get(errorTargetId) || 0;
    // 前回のエラーから 500ms 以内の場合は、Viteの重複リクエストとみなして処理をスルーする
    if (now - lastErrorTime < 500) {
        // すでに1回目でブラウザにエラーは送られているため
    	// 2回目はビルドをクラッシュさせずに静かにプロセスを終了させます
        return;
    }
    clearCache(errorTargetId); // エラー時には、キャッシュ強制クリアが必須です
    
	// タイムスタンプを更新
    lastErrorOverlayCache.set(errorTargetId, now);

	const server = ServerObj.server;
    if(server) {
        // 🌟 ws.send('error') を使う場合、画面にコードスニペットを出すには「生のファイルコード」を frame に載せる必要があります
    	let fileContent = '';
        try{
        	fileContent = fs.readFileSync(errObj.id, 'utf-8');
        }catch (e) {
			// 読み込み失敗時に不用意に復旧させるよりも落とすことで致命的エラーを知らせる
			console.error('環境上のエラーがあります。見直ししてください。')
			throw e;
    	}
    	// Viteのクライアントへ直接エラーイベントを発火（Viteがパスを上書きするのを防ぐ）
    	server.ws.send({
    		type: 'error',
        	err: {
    			message: errObj.message,
            	plugin: 'vite-plugin-auto-replacing',
            	id: errObj.id, // これで別ファイルの絶対パスがそのまま届く
            	loc: errObj.loc,
            	// stack プロパティが必須なので、簡易的なトレース文字列を生成して渡す
            	stack: `Error: ${errObj.message}\n    at ${errObj.id}:${errObj.loc.line}:${errObj.loc.column}`,
        		// エラー箇所の周辺コードスニペットを組み立てて渡す（ViteのError Overlay用）
            	frame: generateCodeFrame(fileContent, errObj.loc.line, errObj.loc.column)
        	}
	    } as any);
        console.log(errObj.message)
    }
};
/**
 * エラー箇所の周辺コードスニペット
 * @param {string} code 
 * @param {number} line 
 * @param {number} column 
 * @returns 
 */
const generateCodeFrame = (code: string, line: number, column: number): string => {
	const lines = code.split('\n');
	const start = Math.max(0, line - 3);
	const end = Math.min(lines.length, line + 3);
	return lines.slice(start, end).map((l, i) => {
		const currentLineNum = start + i + 1;
		const isTarget = currentLineNum === line;
		const prefix = isTarget ? `> ${currentLineNum} | ` : `  ${currentLineNum} | `;
		const pointer = isTarget ? `\n    | ${' '.repeat(column - 1)}^` : '';
		return `${prefix}${l}${pointer}`;
	}).join('\n');
}

type SERVER = {server : ViteDevServer | null};

/** ViteServerを保持するオブジェクト */ 
export const ServerObj: SERVER = {
	server: null,
}

type CONFIG = {viteConfig: ResolvedConfig | null}
/** 
 * ViteConfig格納オブジェクト 
 */
export const ViteConfigObj: CONFIG = {
    viteConfig: null,
}

/**
 * Vite 管理下のソースであることを確認する
 * @param {SourceFile} targetSourceFile 
 * @returns 
 */
export const isInsideTargetSrc: IsInsideTarget = (targetSourceFile: SourceFile): boolean => {
        if(!ViteConfigObj.viteConfig){
          // viteConfigの格納は『configResolved』で実施している
          throw new Error("configResolvedの不具合によりViteConfigがundefinedである")
        }
        // config.root は必ず絶対パスで取得できます
        const projectRoot = ViteConfigObj.viteConfig.root;
        // vite.config.ts に書かれている root ディレクトリの絶対パスを正確に組み立てる
        const definedSrcDir = normalizePath(projectRoot)

        const targetFilePath = targetSourceFile.getFilePath();
        // パスの正規化（OSによる区切り文字 '\' と '/' の違いを吸収）
        const normalizedTargetPath = normalizePath(targetFilePath);
        const normalizedSrcDir = normalizePath(definedSrcDir); //definedSrcDir);
        const _isInsideTargetSrc = normalizedTargetPath.startsWith(normalizedSrcDir);
        return _isInsideTargetSrc;
      }

/**
 * 指定したノードを囲んでいる最寄りの親関数ノードを返す
 * @param {ts.Node} node
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

/** 
 * Generator関数（function*）であるかの判定 
 * @param {ts.FunctionLikeDeclaration} node 
 */
export const isGenerator = function (node: ts.FunctionLikeDeclaration): boolean {
  // アロー関数やコンストラクタなど、asteriskToken を持ち得ないノードを除外
  if ("asteriskToken" in node && node.asteriskToken) {
    return true;
  }
  return false;
}

/** 
 * Async Generator関数（async function*）であるかの判定
 * @param {ts.FunctionLikeDeclaration} node 
 */
export const isAsyncGenerator = function (node: ts.FunctionLikeDeclaration): boolean {
  // function* (Generator) であることが大前提
  if (!isGenerator(node)) return false;

  // かつ、modifiers に `async` キーワードが含まれているか
  return hasAsyncModifier(node);
}

/** 
 * 補助関数: async 修飾子を持っているかチェック 
 * @param {ts.Node} node
 */ 
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
        if (commentText.includes( jsonDataObj.tagMarks.LOOP_YIELD_SKIP_TAG )) {
            return true;
        }
    }
    return false;
}




import * as utils from '../../utils.ts'
import { SourceFile } from 'ts-morph';

export type ReplacementElement = { start: number; end: number; text: string, map?:any }
const replacementMemoryCache = new Map<string, ReplacementElement[]>();
const replacementSourceFileCache = new Map<string, SourceFile>();
/**
 * 他ファイルを置換するとき、置換情報(MagicString)を
 * 保管するキャッシュ
 */
export class ReplacementCache {
    /**
     * 全クリア
     */
    static clear() {
        replacementMemoryCache.clear();
        replacementSourceFileCache.clear();
    }
    /**
     * 置換情報が保管されているかを確認する
     * @param id 
     * @returns 
     */    
    static has(id: string): boolean {
        const normFileName = utils.normalizePath(id);
        return replacementMemoryCache.has(normFileName);
    }
    /**
     * 置換情報配列を取得する
     * @param id 
     * @returns 
     */
    static get(id: string) : ReplacementElement[] | undefined{
        const normFileName = utils.normalizePath(id);
        if(ReplacementCache.has(normFileName)){
            return replacementMemoryCache.get(normFileName);
        }
    }
    /**
     * SourceFileを取得する
     * @param id 
     * @returns 
     */
    static getSourceFile(id: string): SourceFile | undefined {
        const normFileName = utils.normalizePath(id);
        if(replacementSourceFileCache.has(normFileName)) {
            return replacementSourceFileCache.get(normFileName);
        }
        return undefined;
    }
    /**
     * 置換情報を追加
     * @param id 
     * @param file 
     * @param replace 
     */
    static set(id: string, file: SourceFile, replace: ReplacementElement) {
        const normFileName = utils.normalizePath(id);
        const _replace = replacementMemoryCache.get(id);
        if(_replace) {
            _replace.push(replace);
        }else{
            replacementMemoryCache.set(normFileName, [replace]);
        }
        if(!replacementSourceFileCache.has(normFileName)){
            replacementSourceFileCache.set(normFileName, file);
        }
    }
    /**
     * 削除
     * @param id 
     */
    static remove(id: string) {
        const normFileName = utils.normalizePath(id);
        if(ReplacementCache.has(normFileName)){
            replacementMemoryCache.delete(normFileName);
            replacementSourceFileCache.delete(normFileName);
        }
    }
    /**
     * キー配列
     * @returns 
     */
    static keys() {
        return replacementMemoryCache.keys();
    }
}

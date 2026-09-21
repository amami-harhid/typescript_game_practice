import * as utils from './utils.ts'

type MemoryCacheElement = {code: string, map: any};
const inMemoryCache = new Map<string, MemoryCacheElement>();

/**
 * メモリキャッシュ
 * ターゲットのID 以外のファイルを更新するとき
 * メモリキャッシュに入れて引き渡すことで
 * 実ファイルからコードを取り込みしないようにする
 */
export class MemoryCache {
    /**
     * キー(id)を保持することを確認する
     * @param id 
     * @returns 
     */
    static has(id: string): boolean {
        const normFileName = utils.normalizePath(id);
        return inMemoryCache.has(normFileName)
    }
    /**
     * キー(id)を指定してコードを取り出す
     * @param id 
     * @returns 
     */
    static get(id: string): MemoryCacheElement {
        const normFileName = utils.normalizePath(id);
        if(inMemoryCache.has(normFileName)){
            const code = inMemoryCache.get(normFileName);
            return code!;
        }
        else
            return {code: '', map: null};
    }
    /**
     * キー(id)でコードを保管する
     * @param id 
     * @param code 
     */
    static set(id: string, code: string, map: any): void {
        const normFileName = utils.normalizePath(id);
        // 置換処理から書き込む
        inMemoryCache.set(normFileName, {code: code, map: map});
    }
    /**
     * キー(id)でコードを抹消する
     * @param id 
     */
    static remove(id: string) {
        const normFileName = utils.normalizePath(id);
        if(inMemoryCache.has(normFileName)) {
            inMemoryCache.delete(normFileName);
        }
    }
   /**
     * 全てのキーをクリアする
     */
    static clear() {
        inMemoryCache.clear();
    }
 }
import * as custom from './customFileSystem.ts';
import * as utils from './utils.ts'

const inMemoryCache = new Map<string, string>();

export class MemoryCache {
    static clear() {
        console.log('==== MemoryCach.clear');                
        inMemoryCache.clear();
    }
    static has(id: string): boolean {
        const normFileName = utils.normalizePath(id);
        return inMemoryCache.has(normFileName)
    }
    static get(id: string): string {
        const normFileName = utils.normalizePath(id);
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
    static set(id: string, code: string): void {
        if(id == 'D:/Scratch3/ts/typescript_game_practice/src/testV2/010/sub/threads.ts'){
            console.log('==== MemoryCach.set','\n==== id=',id, '\n==== code=',code);        
        }
        const normFileName = utils.normalizePath(id);
        // 置換処理から書き込む
        inMemoryCache.set(normFileName, code);

    }
    static remove(id: string) {
        const normFileName = utils.normalizePath(id);
        if(inMemoryCache.has(normFileName)) {
            inMemoryCache.delete(normFileName);
        }
    }
}
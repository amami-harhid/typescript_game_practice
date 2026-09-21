
import * as utils from '../../utils.ts'
import { SourceFile } from 'ts-morph';

export type ReplacementElement = { start: number; end: number; text: string, map?:any }
const replacementMemoryCache = new Map<string, ReplacementElement[]>();
const replacementSourceFileCache = new Map<string, SourceFile>();
export class ReplacementCache {
    static clear() {
        replacementMemoryCache.clear();
        replacementSourceFileCache.clear();
    }
    
    static has(id: string): boolean {
        const normFileName = utils.normalizePath(id);
        return replacementMemoryCache.has(normFileName);
    }

    static get(id: string) : ReplacementElement[] | undefined{
        const normFileName = utils.normalizePath(id);
        if(ReplacementCache.has(normFileName)){
            return replacementMemoryCache.get(normFileName);
        }
    }
    static getSourceFile(id: string): SourceFile | undefined {
        const normFileName = utils.normalizePath(id);
        if(replacementSourceFileCache.has(normFileName)) {
            return replacementSourceFileCache.get(normFileName);
        }
        return undefined;
    }
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
    static remove(id: string) {
        const normFileName = utils.normalizePath(id);
        if(ReplacementCache.has(normFileName)){
            replacementMemoryCache.delete(normFileName);
        }
    }
    static keys() {
        return replacementMemoryCache.keys();
    }
}

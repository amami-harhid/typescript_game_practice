import { InMemoryFileSystemHost } from "ts-morph";
import * as fs from "fs"; // 実ファイル読み込み用
import * as Cache from "./memoryCache.ts";
import * as Utils from './utils.ts';

export class CustomFileSystemHost extends InMemoryFileSystemHost {
  private currentId: string;
  private currentCode: string;

  constructor(currentId: string, currentCode: string) {
    super();
    this.currentId = currentId;
    this.currentCode = currentCode;
  }

  // 同期読み込みメソッドのみを上書きする
  override readFileSync(filePath: string, encoding?: string): string {

    if(filePath=="D:/projects/ts-scratch3/typescript_game_practice/src/testV2/010/sub/threads.ts"){
        console.log('readFileSync filePath=', filePath);
    }    
    const normKey = Utils.normalizePath(filePath);

    // パターンA: メモリキャッシュ（前回の更新結果）があればそれを返す
    if (Cache.MemoryCache.has(normKey)) {
        const code = Cache.MemoryCache.get(normKey)!;
        if(filePath=="D:/projects/ts-scratch3/typescript_game_practice/src/testV2/010/sub/threads.ts"){
            console.log('thread.ts code = ', code);
        }
        return code;
    }
    // パターンB: 現在 Vite が処理中の index.ts 自体であれば最新のコードを返す
    if (normKey === this.currentId) {
      return this.currentCode;
    }
    // パターンC: それ以外はディスク（実ファイル）から直接読み込む
    return fs.readFileSync(filePath, encoding as BufferEncoding || "utf-8");
  }

  // 非同期読み込みを要求された場合も同様に処理する（Promise版）
  override async readFile(filePath: string, encoding?: string): Promise<string> {
    return this.readFileSync(filePath, encoding);
  }

  // ファイルの存在確認もキャッシュと実ファイルの両方を見る
  override fileExistsSync(filePath: string): boolean {
    const normKey = Utils.normalizePath(filePath);
    return Cache.MemoryCache.has(normKey) || fs.existsSync(filePath);
  }
  override async fileExists(filePath: string): Promise<boolean> {
    return this.fileExistsSync(filePath);
  }

  // ディスク上の実際の実体パスを解決するために必要
  override realpathSync(filePath: string): string {
    return fs.existsSync(filePath) ? fs.realpathSync(filePath) : filePath;
  }
}
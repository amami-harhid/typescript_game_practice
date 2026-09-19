import path from 'path';


/** パスの正規化関数 */
export const normalizePath = (p: string) => path.normalize(p).replace(/\\/g, "/");
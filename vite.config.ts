/**
 * このファイルの内容を変更してはいけません。
 */
import { resolve } from 'path'
import { defineConfig } from 'vite'
import { glob } from 'glob'
import checker from 'vite-plugin-checker';
import { TsCodeReplacer } from './vitePlugins/vite-plugin-ts-code-replacer/index.ts';

// ルートとするディレクトリー
//const root = resolve(import.meta.dirname, './src/')

// ビルド対象のディレクトリーをすべて取得( src の下の index.htmlがあるディレクトリー)
const entries = glob.sync('./src/**/index.html');
const targetDir = []
for(const entry of entries) {
    const directory = entry.replace('./src/', '').replace(/\/index\.html$/,'')
    targetDir.push(directory)
}
const rollupOpsionsInput: {[key : string]: string} = {}
for(const target of targetDir){
    rollupOpsionsInput[target] = resolve(target)
}
// ビルド結果を出力する先
const outDir = resolve(import.meta.dirname, 'docs');

export default defineConfig({
    build: {
        target: "esnext",
        outDir, // ビルド結果を格納する先
        rollupOptions: {
            input: rollupOpsionsInput,
        },
        sourcemap: true
    },
    css: {
        devSourcemap: true
    },
    plugins: [
        TsCodeReplacer(),
        checker({
            typescript: true,
            // eslint: {
            //     lintCommand: `eslint "${resolve(import.meta.dirname, './src/testV2/**/*.{ts,tsx}')}"`,
            // }
        })
    ],
    root: resolve(import.meta.dirname, './src'),
})
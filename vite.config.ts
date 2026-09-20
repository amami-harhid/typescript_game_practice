/// <reference types="node" />
/**
 * このファイルの内容を変更してはいけません。
 * 1行目の reference ～ を消すと、node関係で「Not found」エラーが起こる可能性があります。
 */
import { resolve } from 'path'
import { defineConfig } from 'vite'
import { glob } from 'glob'
import checker from 'vite-plugin-checker';
import { vitePluginAutoReplacer } from './vitePlugins/replacer/index.ts';
//import { vitePluginAutoAwait } from './vitePlugins/tester/index.ts';
import tagMarks from "./vitePlugins/replacer/json/tagMarks.json" with { type: 'json' };
import targetThreadSetter from "./vitePlugins/replacer/json/targetThreadSetter.json"  with { type: 'json' };
import targetAwait from "./vitePlugins/replacer/json/targetAwait.json"  with { type: 'json' };

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

        vitePluginAutoReplacer(tagMarks, targetThreadSetter, targetAwait),
        checker({
            typescript: true,
            // eslint: {
            //      lintCommand: `eslint "${resolve(import.meta.dirname, './src/testV2/**/*.{ts,tsx}')}"`,
            // }
        })
    ],
    root: resolve(import.meta.dirname, './src'),
    server: {
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        },
    },
    preview: {
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        },    
    },
})
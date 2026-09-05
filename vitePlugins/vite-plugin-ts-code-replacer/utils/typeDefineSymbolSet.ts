import path from 'path';

/** クラスシンボル */
export const CLASS_SYMBOL = {
    FONT_CLASS_BRAND: "FontBrandSymbol",
    FONT_IMAGE_CLASS_BRAND: "FontIMageBrandSymbol",
    IMAGE_CLASS_BRAND: "ImageBrandSymbol",
    SOUND_CLASS_BRAND: "SoundBrandSymbol",
    VARIABLE_CLASS_BRAND: "VariableBrandSymbol"
} as const;

/**  型ファイルをそれぞれ絶対パスで定義 */
const basePackagePath = 'node_modules/@tscratch3/typescratcher/src/type';

/** 型ファイルパスの配列を返す */
export const type_definition_files = function(rootPath: string) {
    
    return [
        path.resolve(rootPath, `${basePackagePath}/font/index.ts`), // Font用の型ファイル
        path.resolve(rootPath, `${basePackagePath}/font/fontImage.ts`), // FontImage用の型ファイル
        path.resolve(rootPath, `${basePackagePath}/image/index.ts`), // Image用の型ファイル
        path.resolve(rootPath, `${basePackagePath}/sound/index.ts`), // Sound用の型ファイル（環境に合わせて調整してください）
        path.resolve(rootPath, `${basePackagePath}/entity/monitor/SVariable.ts`), // VariableMonitoring用の型ファイル（環境に合わせて調整してください）
    ];
}

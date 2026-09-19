import { ResolvedConfig } from "vite";

let targetSrcDir = '';
/**
 * プロジェクトルート(絶対パス)配下の『src』ディレクトリ(絶対パス)を組み立てる
 * プラグイン呼出し直下で実行する
 * @param config 
 */
export const configResolve = function(config: ResolvedConfig) {
    // config.root は必ず絶対パスで取得できます
    // vite.config.ts で定義する『root』です
    const projectRoot = config.root;
    targetSrcDir = projectRoot;
}


/**
 * スレッドセッターに代入する『モノ』の実体がターゲットディレクトリ配下でない場合
 * そんなものを代入してはだめですよ！とエラーにする！
 * 
 * 与えたノードの右側が『SyntaxKind.PropertyAccessExpression』のとき
 * symbolを取得して、定義元を取り出す。
 * ・const declarations = symbol.getDeclarations();
 * 『declarations』をもとに、次を取り出す
 * ・『MethodDeclaration』⇒ クラスメソッド
 * ・『PropertyAssignment』⇒ リテラルオブジェクト
 * 定義元のパスを取り出す(絶対パス)
 * ・const definedFilePath = definedNode.getSourceFile().getFilePath();
 * 定義元パスの範囲を確認
 * ・const normalizedDefinedPath = path.normalize(definedFilePath);
 * ・const normalizedSrcDir = path.normalize(targetSrcDir);
 * ターゲットディレクトリ配下にあるかを厳密にチェック
 * ・const isInsideTargetSrc = normalizedDeclPath.startsWith(normalizedSrcDir);
 * ターゲットディレクトリ配下にない場合はエラーにする
 * ターゲットディレクトリ配下にある場合は
 * ・それが 『』
 * 
 * const methodDecl = declarations.find(d => d.getKind() === SyntaxKind.MethodDeclaration);
 * 
 * ・『SyntaxKind.MethodDeclaration』
 * 
 */

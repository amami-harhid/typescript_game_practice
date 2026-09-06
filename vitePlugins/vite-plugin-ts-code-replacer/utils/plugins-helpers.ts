import ts, { CallExpression } from 'typescript';
import { AWAIT_TARGET_METHODS } from './await-target-set.ts';
import { LOOP_YIELD_SKIP_COMMENT } from './loopYieldSkipMark.ts';

export function isTarget(node: ts.Node): boolean {
    return ts.isBreakStatement(node) || ts.isContinueStatement(node);
}

export function createYieldStatement(): ts.ExpressionStatement {
    return ts.factory.createExpressionStatement(
        ts.factory.createYieldExpression(undefined, undefined)
    );
}

export function hasSkipComment(node: ts.Node, sourceFile: ts.SourceFile): boolean {
    const leadingComments = ts.getLeadingCommentRanges(sourceFile.text, node.pos);
    if (!leadingComments) return false;

    for (const commentRange of leadingComments) {
        const commentText = sourceFile.text.substring(commentRange.pos, commentRange.end);
        if (commentText.includes( LOOP_YIELD_SKIP_COMMENT )) {
            return true;
        }
    }
    return false;
}

export function isTargetEventAssignment(node: ts.Node): boolean {

    // Setter "=" でないとき
    if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
        return false;
    }

    // 左側 が "func"でないとき
    const left = node.left;
    if (!ts.isPropertyAccessExpression(left) || left.name.text !== 'func') {
        return false;
    }

    let expr = left.expression;
    if (ts.isCallExpression(expr)) {
        expr = expr.expression;
    }

    if (ts.isPropertyAccessExpression(expr)) {
        //const parentExpr = expr.expression;
        if (ts.isPropertyAccessExpression(expr)) {
            const categoryName = expr.name.text;
            if (categoryName === 'Thread') {
                return true;
            }
        }
    }

    return false;
}

export function isAwaitTargetCallWithComment(node: ts.Node, typeChecker: ts.TypeChecker): boolean {
    if (!ts.isCallExpression(node)) {
        return false;
    }
// 1. いま解析しようとしている呼び出し式全体のテキストを確認
  console.log("\n--- [CALL EXPRESSION DETECTED] ---");
  console.log("呼び出し文全体:", node.getText());
  console.log("node.expression のテキスト:", node.expression.getText());
  console.log("node.expression の種類(SyntaxKind):", ts.SyntaxKind[node.expression.kind]);
// 2. expression の末尾の識別子（wait 部分）をピンポイントで取得
  let targetExpression = node.expression;
  if (ts.isPropertyAccessExpression(node.expression)) {
    // sprite.Control.wait の場合、末尾の "wait" (Identifier) を取得
    targetExpression = node.expression.name;
    console.log("PropertyAccess だったため、末尾の識別子に絞り込み:", targetExpression.getText());
  }

  // 3. 絞り込んだノードから Symbol を取得
  const symbol = typeChecker.getSymbolAtLocation(targetExpression);
    if (symbol) {
        let declarationSymbol = symbol;
        if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
            try {
                declarationSymbol = typeChecker.getAliasedSymbol(symbol);
            } catch (e) {
                // エイリアス解決に失敗した場合はそのまま進む
            }
        }
        // 定義元のノード（Declaration）を取得
        const declarations = declarationSymbol.getDeclarations();
        if (declarations && declarations.length > 0) {
            
            const rawNode = declarations[0]
            // 【チェック1】型チェッカーが最初に見つけたノードの種類とテキスト
            //console.log("[DEBUG 1] 最初に見つけたノードの種類(SyntaxKind):", ts.SyntaxKind[rawNode.kind]);
            //console.log("[DEBUG 1] 最初に見つけたテキスト:", rawNode.getText());

            // 1. 取得したノードが「メソッド名（Identifier）」なら、親の「メソッド定義」まで遡る
            let definitionNode:ts.Node = rawNode;
            while (definitionNode && !ts.isMethodDeclaration(definitionNode) && definitionNode.parent) {
                //const defSourceFile = definitionNode.getSourceFile();
                //console.log("×1定義ファイル:", defSourceFile.fileName);
                definitionNode = definitionNode.parent;
            }

            // 【チェック2】whileループを抜けた後のノードの種類
            //console.log("[DEBUG 2] ループ後のノードの種類(SyntaxKind):", ts.SyntaxKind[definitionNode.kind]);
            //console.log("[DEBUG 2] ループ後のテキスト:", definitionNode.getText());

            //const definitionNode = declarations[0];
            //console.log(definitionNode)
            // 定義元ノードの sourceFile とフルテキストを取得してコメントを解析
            const defSourceFile = definitionNode.getSourceFile();
            if( defSourceFile.fileName.includes('/node_modules/')) {
                return false;
            }

            // メソッド定義が見つかった場合のみ処理を続行
            if (!ts.isMethodDeclaration(definitionNode)) {
                console.log("[DEBUG 2-FAIL] MethodDeclaration まで遡れませんでした。");
                //console.log(definitionNode);
                const defSourceFile = definitionNode.getSourceFile();
                console.log("×2 定義ファイル:", defSourceFile.fileName);
                const defSourceText = defSourceFile.getFullText();
                console.log('×2 defSourceText=', defSourceText);
                return false;
            }

            const defSourceText = defSourceFile.getFullText();
            // メソッドの純粋な開始位置（async wait... の a の位置）
            const nodeStart = definitionNode.getStart(defSourceFile);
            // クラス全体の開始位置、またはそのファイルの本当の先頭位置
            const fullStart = definitionNode.getFullStart();
            // ノードの直前にある、コメントや空白が含まれるテキスト領域を切り出す
            const leadingText = defSourceText.slice(fullStart, nodeStart);
            console.log("[DEBUG 3] 切り出したコメントテキスト: [", leadingText, "]");
            // 切り出したテキストの中に `@needsAwait` が含まれているか判定
            const hasNeedsAwait = leadingText.includes('@needsAwait');

            // const jsDocTags = ts.getJSDocTags(definitionNode);
            // const hasNeedsAwait = jsDocTags.some(tag => {
            //     // tag.tagName.text には "needsAwait" が入ります
            //     console.log('tag.tagName.text=', tag.tagName.text);
            //     return tag.tagName.text === 'needsAwait';
            // });
            if( hasNeedsAwait && node.parent && !ts.isAwaitExpression(node.parent)) {
                return true;
            }

            // if (commentRanges) {
            //     const hasNeedsAwait = commentRanges.some(range => {
            //         const commentText = defSourceText.slice(range.pos, range.end);
            //         console.log(commentText);
            //         return commentText.includes('@needsAwait');
            //     });
            //     //console.log('hasNeedsAwait=',hasNeedsAwait)
            //     if( hasNeedsAwait && node.parent && !ts.isAwaitExpression(node.parent)) {
            //         return true;
            //     }
            // }
        }
    }
    return false;
}

/**
 * 指定した ts.Node の直前にあるコメント文字列の配列を取得する
 * @param node 
 * @param sourceFile 
 * @returns 
 */
function getLeadingComments( node: ts.Node, sourceFile: ts.SourceFile) : string[] {
    const sourceText = sourceFile.getFullText();
    const commentRanges = ts.getLeadingCommentRanges(sourceText, node.getFullStart());
    if(!commentRanges) return [];
    return commentRanges.map(range=>sourceText.slice(range.pos, range.end));

}

/**
 * ノードが await 付与対象のメソッド呼び出しであるか判定する
 */
export function isAwaitTargetCall(node: ts.Node): boolean {
    if (!ts.isCallExpression(node)) {
        return false;
    }

    // 呼び出し元の表現式（this.Control.wait など）を解析
    let expr = node.expression;
    const parts: string[] = [];

    // プロパティアクセスを遡ってパーツを配列に格納する
    while (ts.isPropertyAccessExpression(expr)) {
        parts.unshift(expr.name.text);
        expr = expr.expression;
    }

    // 先頭のオブジェクト名（XXX または this など）を除いた残りのパスを結合
    // 例: ["Control", "wait"] -> "Control.wait"
    const methodPath = parts.join('.');
    return AWAIT_TARGET_METHODS.has(methodPath);
}

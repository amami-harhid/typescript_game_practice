import * as ts from 'typescript';
import { promises as fs } from 'fs';
import { XMLParser } from 'fast-xml-parser';
export const isAwaitAddTransformerVist = function(node: ts.Node, typeChecker: ts.TypeChecker, targetList:string[]): boolean {
    const _node = node as ts.CallExpression;
    let targetExpression = _node.expression;
    if (ts.isPropertyAccessExpression(_node.expression)) {
        const _name = _node.expression.name.getText();
        if( targetList.includes( _name )) {
            // const leftNode = _node.expression.expression; // "sprite.Control" の部分
            // const leftType = typeChecker.getTypeAtLocation(leftNode);
            // if(leftType)
            //     console.log(`[型チェック] ${leftNode.getText()} の型:`, typeChecker.typeToString(leftType));

            let symbol = typeChecker.getSymbolAtLocation(targetExpression);	
            if (symbol) {
                // エイリアス（インポート）の解決
                let declarationSymbol = symbol;
                if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
                    try {
                        declarationSymbol = typeChecker.getAliasedSymbol(symbol);
                    } catch (e) {}
                }
                                        
                const declarations = declarationSymbol.getDeclarations();
                if (declarations && declarations.length > 0) {
                    let definitionNode = declarations[0] as ts.Node;
                                        
                    // MethodDeclaration まで遡る
                    while (definitionNode && !ts.isMethodDeclaration(definitionNode) && definitionNode.parent) {
                        definitionNode = definitionNode.parent;
                    }
                    if (ts.isMethodDeclaration(definitionNode)) {
                        const defSourceFile = definitionNode.getSourceFile();
                        const defSourceText = defSourceFile.getFullText();
                        const fullStart = definitionNode.getFullStart();
                        const nodeStart = definitionNode.getStart(defSourceFile);
                                        
                        // クラスのメソッド定義の直前コメントを切り出す
                        const leadingText = defSourceText.slice(fullStart, nodeStart);
                        //console.log('leadingText=',leadingText)
                        if (leadingText.includes('@needsAwait')) {
                            // すでに await がついていなければ付与
                            if (node.parent && !ts.isAwaitExpression(node.parent)) {
                                //console.log('await ++++')
                                return true;
                            }
                        }
                    }
                }
            }
        }
    }
    return false;
}
interface TargetItem {
    name: string,
    fullName: string,
}
interface AwaitTargets {
  targets: {
    item: TargetItem[],
  },
}

export const awaitTargets = async function() {
    const filePath = './vitePlugins/replacer/awaitTargets.xml';
    const list : string[] = []
    return new Promise<string[]>(async resolve=>{

        const xmlData = await fs.readFile(filePath, 'utf-8');

        const parser = new XMLParser({
            ignoreAttributes: true, // Set to false if you want to keep XML attributes
        });
        const result = parser.parse(xmlData) as AwaitTargets;
        console.log('Successfully parsed XML:', JSON.stringify(result, null, 2));
        console.log(result);
        if( Array.isArray(result.targets.item)) {
            for(const t of result.targets.item){
                list.push(t.name);
            }
        }else{
            list.push(result.targets.item['name']);
        }
        resolve(list);
    });

}
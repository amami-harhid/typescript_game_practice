import * as ts from 'typescript';
import { Node, SyntaxKind } from "ts-morph";
import * as Helper from '../../helper.ts';

/**
 * スレッドセッターに代入する「ノード」の定義を追跡し
 * PropertyAssignment、PropertyAccessExpression、Identifierで
 * ある間、定義元をたどっていく。
 * 
 * @param {Node<ts.Node>} node 
 * @returns 
 */
export const tracer = (node : Node<ts.Node>) => {
    const startNode = node;
    //if (node.getKind() === SyntaxKind.PropertyAccessExpression || node.getKind() === SyntaxKind.Identifier){
        let traceNode = getDefinition(node, startNode);
        const continuedCondition = (node:Node<ts.Node>|undefined) => {
            if(node) {
                return ( 
                    node.getKind()=== SyntaxKind.PropertyAssignment ||
                    node.getKind()=== SyntaxKind.PropertyAccessExpression ||
                    node.getKind()=== SyntaxKind.Identifier
                )
            }else{
                return false;
            }
        }

        let trace = continuedCondition(traceNode)

        while( trace) {
            if(traceNode){
                traceNode = getDefinition(traceNode, startNode);
            }
            trace = continuedCondition(traceNode);
        }
        if(traceNode){
            const targetSourceFile = traceNode.getSourceFile();
            const _isInside = Helper.isInsideTargetSrc(targetSourceFile);
            if(_isInside){
                // Viteルート配下にあるときは 探索したノードを返す
                //console.log("[tracer 001] ", traceNode.getText(), traceNode.getKindName());
                return traceNode;
            // }else{
            //     console.log(node.getText())
            }
        }
    //}
    return undefined;
}

/**
 * 
 * @param {Node<ts.Node>} node 
 * @param {Node<ts.Node>} startNode  
 * @returns 
 */
const getDefinition = (node: Node<ts.Node>, startNode: Node<ts.Node>) => {
    //console.log('---------------------------------');
    //console.log('====> getDefinition In node=', node.getKindName());
    //console.log('---------------------------------');
    if (node.getKind() === SyntaxKind.PropertyAccessExpression){
        const propertyAccessExpression = node.asKindOrThrow(SyntaxKind.PropertyAccessExpression);

        const nameNode = propertyAccessExpression.getNameNode()
        const definitions = nameNode.getDefinitionNodes();
        //console.log('===== definitions length=', definitions.length);
        //console.log(node.getText());
        //console.log('====================')
        if(definitions.length==1){
            const definition = definitions[0];
            //console.log("定義=", definitions[0].getKindName());
            const propertyAssignment = definitions.find(d => d.getKind() === SyntaxKind.PropertyAssignment);
            if( definition.getKind()===SyntaxKind.PropertyAccessExpression){
                const propertyAssignment = definition.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
                const right = propertyAssignment.getLastChild();
                if(right){
                    if(right.getKind()=== SyntaxKind.FunctionExpression){
                        return right;
                    }
                    if(right.getKind()=== SyntaxKind.ArrowFunction){
                        return right;
                    }
                    if(right.getKind()=== SyntaxKind.PropertyAccessExpression){
                        return right;
                    }
                    if(right.getKind()=== SyntaxKind.Identifier){
                        return right;
                    }
                    if(right.getKind()=== SyntaxKind.MethodDeclaration){
                        return right;
                    }
                    console.log('想定外 [***] right=', right.getKindName());
                    console.log('想定外 [***] right=', right.getText());

                }
            }else if(definition.getKind()===SyntaxKind.MethodDeclaration){
                //console.log('methodDeclaration =', definition.getText());
                return definition;

            }else if(definition.getKind()===SyntaxKind.PropertyAssignment){
                return definition;
            }else if(definition.getKind()===SyntaxKind.PropertySignature){
                return definition;
            }
        }else{
            // MethodDeclarationは基本的に最大１個だけなので find() で取得してよい（例外の補足⇒※１）
            // 例外補足１：　例外事項は無視する
            // 通常のクラス定義において、同じクラス内に同名のメソッドを複数定義することができない
            // しかし抽象クラス（Abstract Class）と派生クラスのメソッドを同じシンボルとして解決した場合、
            // またはクラスの宣言マージ（特定のインターフェースや名前空間とクラスをマージして型を拡張する）
            // の場合には複数の MethodDeclaration が1つのシンボルに紐づくケースがある。
            // 別々のクラスで定義された同名メソッドが、ユニオン型などの交差によって1つのシンボルとして
            // 見なされた場合にも、配列に複数含まれることがある。
            // PropertyAssignmentは基本的に最大１個だけなので find() で取得してよい（例外の補足⇒※２）
            // 例外補足２： 例外事項は無視する
            // 1つのオブジェクト内に同じキー（プロパティ名）を複数書くことは通常ありえない。
            // (重複して書くと後ろの定義で上書きされるため)
            // 単一のオブジェクトリテラル内を解析している限りはMAX1個である。
            // しかしts-morph の型チェッカー（TypeChecker）経由でシンボルを取得した場合、
            // 異なる場所にある複数のオブジェクトリテラルが、型推論によって1つの共通のプロパティシンボルに
            // 集約されることがある。
            if(definitions.length > 1) {
                const sourceFile = startNode.getSourceFile();
                const id = sourceFile.getFilePath();
                // 行番号
                const lineNo = startNode.getStartLineNumber();
                // 列番号 = ノード全体の開始位置 - 行の開始位置 + 1 
                const columnNo = startNode.getStart() - startNode.getStartLinePos() + 1;
                // エラー
                const errObj: Helper.ErrorObj = {
                    message: "定義元が一意に定まらないのでコードを見直してください[001]",
                    id: id,
                    loc: {
                        line: lineNo,
                        column: columnNo
                    }, 
                    customSend: true,
                }
                Helper.emitError(errObj);
                Helper.forceErrorObj.forceError = true;
            }else{
                //console.log('想定外 [001] ')

            }
        }

    }else if (node.getKind() === SyntaxKind.Identifier){
        const identifier = node.asKindOrThrow(SyntaxKind.Identifier);
        const definitions = identifier.getDefinitions();
        //console.log('definitions [002]', definitions.length);
        for (const def of definitions) {
            const declarationNode = def.getDeclarationNode();
            if(declarationNode){
                //console.log('declarationNode=', declarationNode.getKindName());
                if (declarationNode.getKind() === SyntaxKind.VariableDeclaration) {
                    // 宣言ノードが変数のとき
                    const variableDeclarator = declarationNode.asKindOrThrow(SyntaxKind.VariableDeclaration);
                    // 変数に代入している定義を取得
                    const initializer = variableDeclarator.getInitializer();
                    if(initializer){
                        if (initializer.getKind() === SyntaxKind.FunctionExpression) {
                            return initializer;
                        }
                        if(initializer.getKind() === SyntaxKind.Identifier){
                            return initializer;
                        }
                        if(initializer.getKind() === SyntaxKind.PropertyAccessExpression){
                            return initializer;
                        }
                    }else{
                        // 代入しているモノがない！
                        console.error('代入しているモノがない！');
                        console.error('declarationNode=', declarationNode.getText())
                    }
                }
            }
        
        }
    }else if (node.getKind() === SyntaxKind.PropertyAssignment){
        const propertyAssignment = node.asKindOrThrow(SyntaxKind.PropertyAssignment);
        const initializer = propertyAssignment.getInitializer();
        if(initializer){
            //console.log('PropertyAssignment initializer=', initializer.getText());
            if(initializer.getKind()===SyntaxKind.FunctionExpression){
                return initializer;
            }
            if(initializer.getKind()===SyntaxKind.ArrowFunction){
                return initializer;
            }
            if(initializer.getKind()===SyntaxKind.Identifier){
                return initializer;
            }
            if(initializer.getKind() === SyntaxKind.PropertyAccessExpression){
                return initializer;
            }
            console.error('想定外の代入[002]')
            console.error('initializer=', initializer.getKindName());
        }
    }else if (node.getKind() === SyntaxKind.PropertySignature){
        const propertySignature = node.asKindOrThrow(SyntaxKind.PropertySignature);
        return propertySignature;
    }
    //console.log("想定外ルート[002] ", node.getKindName());

}
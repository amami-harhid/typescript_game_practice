```typescript
xxx.Thread.func = function() {

};
```

```typescript

const threadObj = {
    thread4: function(this: CustomSprite) {
        for(;;){
            this.Control.wait(1);
        }
    },
};
sprite.Thread.func = threadObj.thread4
// 左側：SyntaxKind.PropertyAssignment
const _propertyAssgnment = propertyDecl.asKindOrThrow(SyntaxKind.PropertyAssignment)
const right = _propertyAssgnment.getLastChild();
if(right.getKind()=== SyntaxKind.FunctionExpression){
    const rightFunc = right.asKindOrThrow(SyntaxKind.FunctionExpression);
    // rightFunc は次のNode
    // function(this: CustomSprite) {
    //    for(;;){
    //        this.Control.wait(1);
    //    }
    // }
}
```


```typescript
// 左側が「識別子（名前）」(Identifier)
const definitions = rightIdentifier.getDefinitions();
// definitionsをループで廻し、
for (const def of definitions) {
    // def の定義元を取り出す
    const declarationNode = def.getDeclarationNode();
    if (!declarationNode) continue; // 定義先がなければ何もしない
    // declarationNode がVariableDeclaration
    if(declarationNode.getKind() === SyntaxKind.VariableDeclaration){
        // 変数のとき
        const variableDeclarator = declarationNode.asKindOrThrow(SyntaxKind.VariableDeclaration);
        // 変数に代入している初期値を取り出す
        const initializer = variableDeclarator.getInitializer();
        // 初期値としてあり得るのは次のとおり(相手にしたいもの)
        // SyntaxKind.FunctionExpression ( 関数 )
        // SyntaxKind.CallExpression ( 関数、メソッド )
        // SyntaxKind.ArrowFunction ( アロー関数 )
        // 
        // initializer == undefined とは、代入していない（変数宣言のみ) の場合である

    }
}
// 右側が『PropertyAccessExpression』のとき
if (rightExpression.getKind() === SyntaxKind.PropertyAccessExpression){
    const rightPropertyAccess = rightExpression.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    const symbol = rightPropertyAccess.getNameNode().getSymbol();
    
}

```
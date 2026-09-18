/**
 * 特徴(ts-morph)
 * 1.スコープを自動で解決してくれる
 * TypeScriptのコンパイラAPIを利用して「この場所にある A が、どのスコープのどの const A を指しているか」
 * を1発で正確に特定します。同名の別変数を誤って書き換えるリスクがゼロになります。
 * 2. 直感的なAPI
 * funcExpr.setIsAsync(true) や setIsGenerator(true) を呼ぶだけで、ts-morph が自動的に適切な位置へ 
 * async や * を挿入し、コードを再フォーマットしてくれます。
 * 文字数を計算して手動で書き換える（overwrite する）必要がありません。
 * 3. アロー関数への対応も容易
 * もし元のコードが const A = () => {} だった場合、ジェネレータ化するには function 構文にする必要が
 * ありますが、それも上記の例のように replaceWithText で簡単に対応可能です。
 */
import * as ts from 'typescript';
import { Node, Expression, Project, SyntaxKind, PropertyAccessExpression, SourceFile } from 'ts-morph';
import MagicString from 'magic-string';
import * as path from 'path';
import * as Cache from './memoryCache.ts';
import targetThreadSetter from './json/targetThreadSetter.json' with { type: 'json' };
import * as TagMark from './TagMarks.ts';

// トランスフォーマーを呼び出すごとに新しくProjectを作る
function getOrInitProject(): Project {

    const project = new Project({
        compilerOptions: { target: 99 /* ESNext */ },
        skipAddingFilesFromTsConfig: true, // 高速化
    });

    return project;
}

// 置換位置を記録するための配列
const replacements: { start: number; end: number; text: string }[] = [];

/**
 * function を async function* とする
 * 置換結果はMagicStringへ書き込む
 * @param expr 
 * @returns 
 */
const funcToAsyncGenerator = (expr: Expression<ts.Expression>): boolean => {
    let hasChanged = false;
    const funcExpr = expr.asKindOrThrow(SyntaxKind.FunctionExpression);
    if (!funcExpr.isAsync() && !funcExpr.isGenerator()) {
        // async 属性を true に書き換える
        const start = funcExpr.getStart();
        replacements.push({
            start: start,
            end: start + 8, // "function" の長さ
            text: 'async function*'
        });
        hasChanged = true;
    }else if(!funcExpr.isAsync()) {
        const start = funcExpr.getStart();
        replacements.push({
            start: start,
            end: start + 8, // "function" の長さ
            text: 'async function'
        });
        hasChanged = true;
    }else if(!funcExpr.isGenerator()) {
        const start = funcExpr.getStart();
        replacements.push({
            start: start,
            end: start + 8, // "function" の長さ
            text: 'function*'
        });
        hasChanged = true;    
    }
    return hasChanged;
}
/**
 * アロー関数を async function* へと置換する
 * @param expr 
 * @returns 
 */
const arrowToAsyncGenerator = (expr: Expression<ts.Expression>): boolean => {
    const arrowFunc = expr.asKindOrThrow(SyntaxKind.ArrowFunction);
    const bodyText = arrowFunc.getBody().getText();
    const paramsText = arrowFunc.getParameters().map(p => p.getText()).join(', ');
    const start = arrowFunc.getStart();
    const end = arrowFunc.getEnd();

    // アロー関数を async function* () {} の文字列に置き換える
    const code = `async function* (${paramsText}) ${bodyText}`;
    replacements.push({
        start: start,
        end: end, // "function" の長さ
        text:  code
    });
    return true;
}

/**
 * スレッドのセッターを探索して、セッターに代入している関数を AsyncGenerator関数に置換する。
 * セッターへ関数を代入している場合はその関数を置換、セッターへ変数を代入している場合は
 * その変数の宣言を探索し、変数へ代入している関数を置換する。
 * なお変数の宣言の探索はimport先(別のコードファイル)まで追跡して置換する。
 * スレッドセッターの探索方法はJSON(targetThreadSetter.json)に登録されているものとする。
 * なお、このメソッドでは「MagicString」と「ts-morph」を使用している
 * @param {string} code コード 
 * @param {string} id ファイルパス 
 * @returns 
 */
export function asyncGeneratorTransformer(code: string, id: string ): { code: string; map: any } {
    const magicString = new MagicString(code)
    const currentProject = getOrInitProject();
    const sourceFile = currentProject.createSourceFile(id, code, { overwrite: true });
    replacements.splice(0, replacements.length); // 配列要素をゼロ個にする
    let hasChanged = false;
    // 代入式（PropertyAccessExpression = Identifier）を走査
    const assignments = sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression);
    for(const assignment of assignments){
        // `=` 演算子であることを確認
        if (assignment.getOperatorToken().getKind() == SyntaxKind.EqualsToken) {
            const leftExpression = assignment.getLeft();
            const rightExpression = assignment.getRight();
            // 左辺が `xxx.Thread.func` のようなプロパティアクセスか確認
            if (leftExpression.getKind() === SyntaxKind.PropertyAccessExpression) {

                const leftText = leftExpression.getText();
                // 特定のパターン（末尾が .Thread.func）にマッチするか確認
                const words = leftText.replace(/^.+\.(.+\..+)$/, "$1");
                if (targetThreadSetter.targets.includes(words)) {
                    //console.log(words)
                    const children = leftExpression.getChildren();
                    const func = children[children.length-1]; // xxx.Thread.func のときに 最後のNode(=func)を取り出す
                    // func.getKind() --> 80 --> SyntaxKind.Identifier
                    if(func.getKind() == SyntaxKind.Identifier) {
                        const setterNode = func.getParent();
                        if( Node.isPropertyAccessExpression(setterNode)) {
                            const propertyAccessExp = setterNode as PropertyAccessExpression;
                            const symbol = propertyAccessExp.getSymbol();
                            if(symbol){
                                //console.log('symbol=', symbol)
                                const declarations = symbol.getDeclarations();
                                const setterDeclaration = declarations.find(Node.isSetAccessorDeclaration);
                                if (setterDeclaration) {
                                    //console.log(setterDeclaration)
                                    const jsDocs = setterDeclaration.getJsDocs();
                                    //console.log('jsDocs length=', jsDocs.length)
                                    const match = jsDocs.some((jsDoc)=>{
                                        const jsDocText = jsDoc.getText();
                                        //console.log('jsDocText =', jsDocText )
                                        if(jsDocText.includes( TagMark.THREAD_SETTER_TAG )) {
                                            //console.log(TagMark.THREAD_SETTER_TAG)
                                            return true;
                                        }
                                    });
                                    if(match) {
                                        //console.log('Start replaceRightExpression')
                                        hasChanged = replaceRightExpression(rightExpression, sourceFile);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    };

    // magic-string を使って、安全に一括置換を行う
    //console.log('replacements=', replacements)
    for (const r of replacements) {
        magicString.overwrite(r.start, r.end, r.text);
    }
    const finalCode = magicString.toString();
    const map = magicString.generateMap(
        { 
            hires: true, 
            source: path.basename(id),
            includeContent: true,
        }
    )

    if (!hasChanged) {
        // メモリ解放のためにソースファイルを削除
        currentProject.removeSourceFile(sourceFile);
        return {
            code : finalCode,
            map: map,
        };
    }
    // メモリ解放のためにソースファイルを削除
    currentProject.removeSourceFile(sourceFile);

    return {
        code: finalCode,
        map: map,
    }
}

const replaceRightExpression = (rightExpression: Expression<ts.Expression>, sourceFile: SourceFile) => {
    let hasChanged = false;
    // 右側が『PropertyAccessExpression』のとき
    // クラスインスタンスメソッドまたはリテラルオブジェクトのメソッドの場合が想定される
    if (rightExpression.getKind() === SyntaxKind.PropertyAccessExpression){
        const rightPropertyAccess = rightExpression.asKindOrThrow(SyntaxKind.PropertyAccessExpression);

        // xxx.Thread.func = sprite.thread; // 右側はクラスインスタンスのメソッド
        // このとき rightPropertyAccess.getText() ===> "sprite.thread"
        
        //const code = rightPropertyAccess.getText();
        //console.log('code=', code);
        //const def = rightPropertyAccess.getLastChild();
        //console.log(def?.getText());
        //const nameNode = rightPropertyAccess.getNameNode();
        //console.log("アクセスしているプロパティ名:", nameNode.getText());
        
        const symbol = rightPropertyAccess.getNameNode().getSymbol();
        if (symbol) {
            // そのシンボルが定義されている元の宣言（Node）を取得
            const declarations = symbol.getDeclarations();

            // クラスの MethodDeclaration (メソッド宣言) が見つかる
            const methodDecl = declarations.find(d => d.getKind() === SyntaxKind.MethodDeclaration);
            const propertyDecl = declarations.find(d => d.getKind() === SyntaxKind.PropertyAssignment);
            if (methodDecl && methodDecl.getKind() == SyntaxKind.MethodDeclaration) {
                
                const targetFile = methodDecl.getSourceFile();
                let isSameSourceFile = true;
                if(targetFile != sourceFile) {
                    // 宣言が別ファイルのとき
                    isSameSourceFile = false;
                }
                
                const _method = methodDecl.asKindOrThrow(SyntaxKind.MethodDeclaration)
                //console.log("目的のメソッド宣言を取得しました！:", _method.getText());
                
                if(!(_method.isAsync() && _method.isGenerator())) {
                    // Async & Generatorでないとき
                    if(!isSameSourceFile){
                        //console.log('別ファイル')
                        const bodyText = _method.getBody()?.getText();
                        const paramsText = _method.getParameters().map(p => p.getText()).join(', ');
                        const methodName = _method.getName();
                        const _methodName = (methodName)? methodName: '';
                        _method.replaceWithText(`async *${_methodName} (${paramsText}) ${bodyText}`);
                        const replacedId = targetFile.getFilePath()
                        const replacedCode = targetFile.getText();
                        Cache.MemoryCache.set(replacedId, replacedCode);
                        targetFile.forget(); // 読み込み直し
                    }else{
                        //console.log('同一ファイルだよ')
                        const start = _method.getStart();
                        const _methodCode = _method.getText();
                        //console.log('_methodCode=', _methodCode)
                        const end = _methodCode.indexOf('(');
                        const name = _method.getName();
                        //console.log('end=',end)
                        replacements.push({
                            start: start,
                            end: start + end, // "function" の長さ
                            text: `async *${name}`
                        });
                        hasChanged = true;
                    }
                }
            }else if (propertyDecl && propertyDecl.getKind()==SyntaxKind.PropertyAssignment) {

                const targetFile = propertyDecl.getSourceFile();
                let isSameSourceFile = true;
                if(targetFile != sourceFile) {
                    // 宣言が別ファイルのとき
                    isSameSourceFile = false;
                }

                const _propertyAssgnment = propertyDecl.asKindOrThrow(SyntaxKind.PropertyAssignment)
                //console.log("目的のメソッド宣言を取得しました！:", _propertyAssgnment.getText());
                //const name = _propertyAssgnment.getName();
                //console.log('name= ', name)
                const right = _propertyAssgnment.getLastChild();
                if(right && right.getKind()=== SyntaxKind.FunctionExpression){
                    //console.log('right=', right.getText());
                    const _func = right.asKindOrThrow(SyntaxKind.FunctionExpression);
                    //console.log(_func)
                    if(_func){
                        if(!(_func.isAsync() && _func.isGenerator())) {
                            const _start = _func.getStart();
                            const _methodCode = _func.getText();
                            const _functionName = _func.getName();
                            const __functionName = (_functionName)? _functionName: ''; 
                            const end = _methodCode.indexOf('(');
                            replacements.push({
                                start: _start,
                                end: _start + end, // "function" の長さ
                                text: `async ${__functionName} function* `
                            });
                            hasChanged = true;
                        }
                    }
                }else if(right && right.getKind()=== SyntaxKind.ArrowFunction){
                    const func = right.asKindOrThrow(SyntaxKind.ArrowFunction);
                    if(isSameSourceFile) {
                        //console.log('右側がアロー')
                        //console.log('_func.isAsync()=', func.isAsync())
                        const bodyText = func.getBody().getText();
                        const paramsText = func.getParameters().map(p => p.getText()).join(', ');
                        const arrowStart = func.getStart();
                        const arrowEnd = func.getEnd();
                        //console.log('arrowStart, arrowEnd=', arrowStart, arrowEnd)

                        // アロー関数を async function* () {} の文字列に置き換える
                        const arrowFuncCode = `async function* (${paramsText}) ${bodyText}`;
                        //console.log('arrow code=\n',arrowFuncCode)
                        replacements.push({
                                start: arrowStart,
                                end: arrowEnd, //arrowEnd, 
                                text: arrowFuncCode
                            });
                        hasChanged = true;
                    }else{
                        // 他のファイルのとき
                        const bodyText = func.getBody().getText();
                        const paramsText = func.getParameters().map(p => p.getText()).join(', ');
                        func.replaceWithText(`async function* (${paramsText}) ${bodyText}`);
                        const replacedId = targetFile.getFilePath()
                        const replacedCode = targetFile.getText();
                        //console.log('replacedCode=', replacedCode);
                        Cache.MemoryCache.set(replacedId, replacedCode);
                        targetFile.forget(); // 読み込み直し                        
                    }


                }

                // const targetFile = _method.getSourceFile();
                // if(!(_method.isAsync() && _method.isGenerator())) {
                //     // Async & Generatorでないとき
                //     let isSameSourceFile = true;
                //     if(targetFile != sourceFile) {
                //         // 宣言が別ファイルのとき
                //         isSameSourceFile = false;
                //     }
                //     if(!isSameSourceFile){
                //         console.log('別ファイル')
                //         const bodyText = _method.getBody()?.getText();
                //         const paramsText = _method.getParameters().map(p => p.getText()).join(', ');
                //         const methodName = _method.getName();
                //         _method.replaceWithText(`async *${methodName} (${paramsText}) ${bodyText}`);
                //             const replacedId = targetFile.getFilePath()
                //         const replacedCode = targetFile.getText();
                //         Cache.MemoryCache.set(replacedId, replacedCode);
                //         targetFile.forget(); // 読み込み直し
                //     }else{
                //         console.log('同一ファイルだよ')
                //         const start = _method.getStart();
                //         const _methodCode = _method.getText();
                //         console.log('_methodCode=', _methodCode)
                //         const end = _methodCode.indexOf('(');
                //         const name = _method.getName();
                //         console.log('end=',end)
                //         replacements.push({
                //             start: start,
                //             end: start + end, // "function" の長さ
                //             text: `async *${name}`
                //         });
                //         hasChanged = true;
                //     }
                // }
            }
            

        }
    }
    if (rightExpression.getKind() === SyntaxKind.Identifier) {
        // セッターに変数（関数）を代入しているとき
        const rightIdentifier = rightExpression.asKindOrThrow(SyntaxKind.Identifier);
        // ts-morphの機能：変数の「定義元（宣言）」を直接取得する
        const definitions = rightIdentifier.getDefinitions();
        for (const def of definitions) {
            const declarationNode = def.getDeclarationNode();
            if (!declarationNode) continue;
            const targetFile = declarationNode.getSourceFile();
            let isSameSourceFile = true;
            if(targetFile != sourceFile) {
                // 宣言が別ファイルのとき
                isSameSourceFile = false;
            }
            //console.log('declarationNode.getText()=', declarationNode.getText())
            //console.log('declarationNode.getKind()=', declarationNode.getKind());
            
            // 変数宣言（const XXX = ...）であるか確認
            if (declarationNode.getKind() === SyntaxKind.VariableDeclaration) {
                const variableDeclarator = declarationNode.asKindOrThrow(SyntaxKind.VariableDeclaration);
                const initializer = variableDeclarator.getInitializer();
                if(initializer){
                    //console.log(SyntaxKind.MethodDeclaration)
                    // 通常の関数式 (function() {}) の場合
                    if (initializer.getKind() === SyntaxKind.FunctionExpression) {
                        // 宣言が別ファイルのとき
                        if(!isSameSourceFile){
                            //console.log('別ファイルで 置換')
                            const func = initializer.asKindOrThrow(SyntaxKind.FunctionExpression);
                            const bodyText = func.getBody().getText();
                            const paramsText = func.getParameters().map(p => p.getText()).join(', ');
                            func.replaceWithText(`async function* (${paramsText}) ${bodyText}`);
                            const replacedId = targetFile.getFilePath()
                            const replacedCode = targetFile.getText();
                            Cache.MemoryCache.set(replacedId, replacedCode);
                            targetFile.forget(); // 読み込み直し
                        }else{
                            //console.log('同一ファイルで funcToAsyncGenerator')
                            hasChanged = funcToAsyncGenerator(initializer);
                        }
                    } else if (initializer.getKind() === SyntaxKind.ArrowFunction) {
                        // もしアロー関数 (async () => {}) だった場合の考慮
                        // （アロー関数は generator になれないため、通常の関数式へ変換が必要）
                        // アロー関数を async function* () {} の文字列に置き換える
                        hasChanged = arrowToAsyncGenerator(initializer);
                    }
                }
            }
        }
    }else {
        // セッターに変数を代入していないとき
        // 右辺が識別子（関数）であるか確認する
        if (rightExpression.getKind() === SyntaxKind.FunctionExpression) {
            // セッターに関数を代入しているとき
            // 関数を async function* にする
            hasChanged = funcToAsyncGenerator(rightExpression);
        } else if (rightExpression.getKind() === SyntaxKind.ArrowFunction) {
            // アロー関数の場合
            // アロー関数を async function* () {} の文字列に置き換える
            hasChanged = arrowToAsyncGenerator(rightExpression);
        }
    } 
    return hasChanged;
}
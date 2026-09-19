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
import { Node, Expression, Project, SyntaxKind, PropertyAccessExpression, SourceFile, ArrowFunction } from 'ts-morph';
import MagicString from 'magic-string';
import * as path from 'path';
import targetThreadSetter from './json/targetThreadSetter.json' with { type: 'json' };
import * as TagMark from './TagMarks.ts';
import { EmitErrorWrapper } from './helper.ts';
import * as REPLACER from './helperAsyncGeneratoReplacer.ts';

// トランスフォーマーを呼び出すごとに新しくProjectを作る
function getOrInitProject(): Project {

    const project = new Project({
        compilerOptions: { target: 99 /* ESNext */ },
        skipAddingFilesFromTsConfig: true, // 高速化
    });

    return project;
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
 * @param {EmitErrorWrapper} emitError 独自エラーメッセージ送信するメソッド
 * @returns 
 */
export function asyncGeneratorTransformer(code: string, id: string, emitError: EmitErrorWrapper ): { code: string; map: any, forceError: boolean } {
    const magicString = new MagicString(code)
    const currentProject = getOrInitProject();
    const sourceFile = currentProject.createSourceFile(id, code, { overwrite: true });
    REPLACER.replacements.splice(0, REPLACER.replacements.length); // 配列要素をゼロ個にする
    let hasChanged = false;
    let forceError = false;
    // 代入式（PropertyAccessExpression = Identifier）を走査
    const assignments = sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression);
    for(const assignment of assignments){ //【A】assignmentsループ
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
                    if(func.getKind() == SyntaxKind.Identifier /* (80) */) {  
                        const setterNode = func.getParent();
                        if( Node.isPropertyAccessExpression(setterNode)) {
                            const propertyAccessExp = setterNode as PropertyAccessExpression;
                            // セッターの左側のJSDOCを探索し、条件に合致するときは
                            // セッターの右側を探索して置換処理をする。
                            const symbol = propertyAccessExp.getSymbol();
                            if(symbol){
                                const declarations = symbol.getDeclarations();
                                const setterDeclaration = declarations.find(Node.isSetAccessorDeclaration);
                                if (setterDeclaration) {
                                    const jsDocs = setterDeclaration.getJsDocs();
                                    const match = jsDocs.some((jsDoc)=>{
                                        const jsDocText = jsDoc.getText();
                                        if(jsDocText.includes( TagMark.THREAD_SETTER_TAG )) {
                                            return true;
                                        }
                                    });
                                    if(match) {
                                        // TagMark.THREAD_SETTER_TAGがJSDOCに書かれている場合
                                        // セッターに代入している方を探索して置換処理をする
                                        const rightRslt = replaceRightExpression(id, rightExpression, sourceFile, emitError);
                                        hasChanged = rightRslt.hasChanged;
                                        if(rightRslt.forceError && rightRslt.forceError === true){
                                            forceError = rightRslt.forceError;
                                            // 【A】assignmentsループを抜ける
                                            //console.log('【A】assignmentsループを抜ける')
                                            break;
                                        }
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
    for (const r of REPLACER.replacements) {
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
            forceError: forceError
        };
    }
    // メモリ解放のためにソースファイルを削除
    currentProject.removeSourceFile(sourceFile);

    return {
        code: finalCode,
        map: map,
        forceError: forceError
    }
}

/**
 * 左側の置換処理
 * @param {string} id 対象ファイルのパス
 * @param {Expression<ts.Expression>} rightExpression 左部のExpression 
 * @param {SourceFile} sourceFile 
 * @param {EmitErrorWrapper} emitError 
 * @returns 
 */
const replaceRightExpression = (id:string, rightExpression: Expression<ts.Expression>, sourceFile: SourceFile, emitError: EmitErrorWrapper): {hasChanged:boolean, forceError?: boolean} => {
    let hasChanged = false;
    // 右側が『PropertyAccessExpression』のとき
    // クラスインスタンスメソッドまたはリテラルオブジェクトのメソッドの場合が想定される
    if (rightExpression.getKind() === SyntaxKind.PropertyAccessExpression){
        const rightPropertyAccess = rightExpression.asKindOrThrow(SyntaxKind.PropertyAccessExpression);

        const symbol = rightPropertyAccess.getNameNode().getSymbol();
        if (symbol) {
            // そのシンボルが定義されている元の宣言（Node）を取得
            const declarations = symbol.getDeclarations();

            // クラスの MethodDeclaration (メソッド宣言) が見つかる
            const methodDecl = declarations.find(d => d.getKind() === SyntaxKind.MethodDeclaration);
            const propertyDecl = declarations.find(d => d.getKind() === SyntaxKind.PropertyAssignment);

            // メソッドのとき ( Arrow関数の考慮は不要 )
            if (methodDecl && methodDecl.getKind() == SyntaxKind.MethodDeclaration) {
                
                const targetFile = methodDecl.getSourceFile();
                let isSameSourceFile = true;
                if(targetFile != sourceFile) {
                    // 宣言が別ファイルのとき
                    isSameSourceFile = false;
                }
                
                
                const _method = methodDecl.asKindOrThrow(SyntaxKind.MethodDeclaration)
                
                if(!(_method.isAsync() && _method.isGenerator())) {
                    // Async & Generatorでないとき
                    if(!isSameSourceFile){
                        //console.log('別ファイル')
                        REPLACER.methodToAsyncGeneratorAnotherFile(_method, targetFile);
                    }else{
                        REPLACER.methodToAsyncGenerator(_method);
                        hasChanged = true;
                    }
                }
            }else 
            // リテラルオブジェクトのとき ( Arrow関数をかけるので Arrow関数の考慮が必要 )
            if (propertyDecl && propertyDecl.getKind()==SyntaxKind.PropertyAssignment) {

                const targetFile = propertyDecl.getSourceFile();
                let isSameSourceFile = true;
                if(targetFile != sourceFile) {
                    // 宣言が別ファイルのとき
                    isSameSourceFile = false;
                }

                const _propertyAssgnment = propertyDecl.asKindOrThrow(SyntaxKind.PropertyAssignment)
                const right = _propertyAssgnment.getLastChild();

                // Functionの場合
                if(right && right.getKind()=== SyntaxKind.FunctionExpression){
                    const _func = right.asKindOrThrow(SyntaxKind.FunctionExpression);
                    if(_func){
                        if(isSameSourceFile) {
                            hasChanged = REPLACER.funcToAsyncGenerator(_func);
                            hasChanged = true;

                        }else{
                            REPLACER.funcToAsyncGeneratorAnotherFile(_func, targetFile);
                        }
                    }
                }else 
                // アロー関数の場合    
                if(right && right.getKind()=== SyntaxKind.ArrowFunction){

                    // アロー関数はスレッド化には不適なのでエラーとする
                    const func = right.asKindOrThrow(SyntaxKind.ArrowFunction);
                    if(isSameSourceFile) {
                        REPLACER.arrowFuncErrorAction(id, func, sourceFile, emitError);

                    }else{
                        //console.log(func.getText())
                        // アロー関数のとき（かつ他のファイルのとき）エラーにする
                        REPLACER.arrowFuncErrorActionAnotherFile(func, sourceFile, targetFile, emitError);
                        return {hasChanged: false, forceError: true};
                    }


                }
            }
        }
    }
    // 左側が変数(Identifier)のとき
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
                            REPLACER.funcToAsyncGeneratorAnotherFile(func, targetFile);
                        }else{
                            //console.log('同一ファイルで funcToAsyncGenerator')
                            hasChanged = REPLACER.funcToAsyncGenerator(initializer);
                        }
                    } else if (initializer.getKind() === SyntaxKind.ArrowFunction) {
                        // もしアロー関数 (async () => {}) だった場合の考慮
                        // （アロー関数は generator になれないため、通常の関数式へ変換が必要）
                        // アロー関数を async function* () {} の文字列に置き換える
                        hasChanged = REPLACER.arrowToAsyncGenerator(initializer);
                    }
                }
            }
        }
    }else {
        // セッターに変数を代入していない場合の処理
        // すなわちセッターに関数を代入していることになるが、そのときは同一ファイルになるので
        // 別ファイルの考慮は不要である。

        // 右辺が識別子（関数）であるか確認する
        if (rightExpression.getKind() === SyntaxKind.FunctionExpression) {
            // セッターに「function」を代入しているとき
            // 関数を async function* にする
            hasChanged = REPLACER.funcToAsyncGenerator(rightExpression);
        } else if (rightExpression.getKind() === SyntaxKind.ArrowFunction) {
            // アロー関数の場合, エラーにする
            const func = rightExpression as ArrowFunction;
            REPLACER.arrowFuncErrorAction(id, func, sourceFile, emitError);
            //hasChanged = arrowToAsyncGenerator(rightExpression);
        }
    } 
    return {hasChanged: hasChanged};

}

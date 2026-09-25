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
import { Node, Project, SyntaxKind, PropertyAccessExpression } from 'ts-morph';
import MagicString from 'magic-string';
import * as path from 'path';
import * as Helper from '../../helper.ts';
import * as REPLACER from './asyncGeneratoReplacer.ts';
import * as RightExpression from './asyncGeneratorRightExpression.ts'
import * as AsyncGeneratorHelp from './asyncGeneratorHelper.ts';
import * as MemoryCache from '../../memoryCache.ts';
import { AsyncGeneratorError } from './asyncGeneratorError.ts';

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
 * @returns 
 */
export function transform(code: string, id: string ): { code: string; map: any, forceError: boolean } {
    try{
        const result = _transform(code, id);
        return result;
    }catch(error){
        if(error instanceof AsyncGeneratorError) {
            const errorObj = error.errorObj;
            Helper.emitError(errorObj);
            return { code: code, map: null, forceError: true };
        }
        throw error;
    }
}

function _transform(code: string, id: string ): { code: string; map: any, forceError: boolean } {

    if(Helper.forceErrorObj.forceError) {
        return {
            code : code,
            map: null,
            forceError: true,
        };                
    }
    
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
                const children = leftExpression.getChildren();
                
                let _nodeText = "";
                //console.log('leftText=', leftText);
                for(const child of children){
                    if(child.getKind()===SyntaxKind.CallExpression){
                        //console.log('child=', child.getText(), " : kind=", child.getKindName());
                        const _children = child.getChildren();
                        for(const _child of _children){
                            if(!(_child.getKind()===SyntaxKind.OpenParenToken 
                                || _child.getKind()===SyntaxKind.CloseParenToken 
                                || _child.getKind()===SyntaxKind.SyntaxList)) {
                                _nodeText += _child.getText();
                                //console.log('_child=', _child.getText(), ' : kind=', _child.getKindName());
                            }
                        }

                    }else if(child.getKind()===SyntaxKind.Identifier){
                        _nodeText += child.getText();
                        //console.log('child=', child.getText(), " : kind=", child.getKindName());
                    
                    }else if(child.getKind()===SyntaxKind.PropertyAccessExpression){
                        _nodeText += child.getText();
                        //console.log('child=', child.getText(), " : kind=", child.getKindName());
                    
                    }else if(child.getKind()===SyntaxKind.DotToken){
                            _nodeText += child.getText();
                    }
                }
                //console.log('_nodeText=', _nodeText);
                // 特定のパターン（例：末尾が .Thread.func）にマッチするか確認
                // targetThreadSetter.json の targetsRegExp.pattern の正規表現で検証する
                let regexThreadSetterMatch = false;
                if( Helper.regexpObj.regexThreadSetter ){
                    for(const regexp of Helper.regexpObj.regexThreadSetter) {
                        const _match = regexp.test(_nodeText)
                        if(_match){
                            regexThreadSetterMatch = true;
                            break;
                        }
                    }
                }
                if( regexThreadSetterMatch === true) {
                //const words = leftText.replace(/^.+\.(.+\..+)$/, "$1");
                //if (targetThreadSetter.targets && targetThreadSetter.targets.includes(words)) {
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
                                        if(jsDocText.includes( Helper.jsonDataObj.tagMarks.THREAD_SETTER_TAG )) {
                                            return true;
                                        }
                                    });
                                    if(match) {
                                        // TagMark.THREAD_SETTER_TAGがJSDOCに書かれている場合
                                        // セッターに代入している方を探索して置換処理をする
                                        const rightRslt = RightExpression.replacer(id, rightExpression, sourceFile);
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
    
    // 定義元が他ファイルにあるときに他ファイルの置換を要する場合がある
    // 他ファイル置換を要する場合はCacheにためておき、ここで
    // 一括して置換し map を作り出し、「MemoryCache」に保管する
    // 「MemoryCache」にためたコードとMapは、メイン処理のロードメソッドで取り出される。
    for(const fileName of AsyncGeneratorHelp.ReplacementCache.keys()){
        const elements = AsyncGeneratorHelp.ReplacementCache.get(fileName);
        if(elements){
            const targetFile = AsyncGeneratorHelp.ReplacementCache.getSourceFile(fileName);
            if(targetFile){
                const _code = targetFile.getText();
                const _magicString = new MagicString(_code);
                for(const element of elements ) {

                    _magicString.overwrite(element.start, element.end, element.text);
                
                }
                const _map = _magicString.generateMap(
                    {
                        hires: true,
                        source: path.basename(fileName),
                        includeContent: true,
                    }
                );
                const _replaceCode = _magicString.toString();
                //console.log('fileName=', fileName);
                //console.log('newCode=', _replaceCode)
                MemoryCache.MemoryCache.set(fileName, _replaceCode, _map);
            }

        }
    }

    // magic-string を使って、安全に一括置換を行う
    //console.log('REPLACER.replacements=', REPLACER.replacements)
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


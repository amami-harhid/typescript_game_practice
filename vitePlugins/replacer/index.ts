import * as ts from 'typescript';
import type { Plugin } from 'vite';
import * as path from 'path';
import { isTargetEventAssignment, hasSkipComment } from '../vite-plugin-ts-code-replacer/utils/plugins-helpers.ts';
import { convertToAsyncGenerator, transformIfBody, transformLoopBody } from '../vite-plugin-ts-code-replacer/transformers/transformer.ts';
export function vitePluginAutoAwait(): Plugin {
  let program: ts.Program | null = null;
  const targetVariableNames = new Set<string>();
  return {
    name: 'vite-plugin-auto-await',
    enforce: 'pre', 
    // 💡 プロジェクト起動時に tsconfig.json を読み込んで、型環境を完全に構築する
    buildStart() {
      const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json');
      if (!configPath) {
        console.error("tsconfig.json が見つかりません。");
        return;
      }

      // tsconfig.json の中身をパース
      const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
      const configParseResult = ts.parseJsonConfigFileContent(
        readResult.config,
        ts.sys,
        path.dirname(configPath)
      );

      // プロジェクト全体のファイルを最初からすべて含んだ Program を作成
      program = ts.createProgram(configParseResult.fileNames, configParseResult.options);
    },

    transform(code, id) {
      // node_modules やに対象外のファイルはスルー
    	if (!id.endsWith('.ts') && !id.endsWith('.tsx') || id.includes('node_modules')) return null;
    	if (!program) return null;

      // 開発中にファイルが書き換わった場合は、Program を最新状態に更新する（HMR対応）
    	const sourcePath = path.normalize(id).replace(/\\/g, '/');
    	const sourceFile = program.getSourceFile(sourcePath);
      
      // もし新しいファイルが追加されたり、既存ファイルが更新されていたら Program を再作成
    	if (!sourceFile) {
    		const compilerOptions = program.getCompilerOptions();
        	const rootNames = Array.from(new Set([...program.getRootFileNames(), sourcePath]));
        	program = ts.createProgram(rootNames, compilerOptions, undefined, program);
      	}

	    const typeChecker = program.getTypeChecker();
      	const currentSourceFile = program.getSourceFile(sourcePath);
      	if (!currentSourceFile) return null;

      	let isModified = false;

      	// AST Transformer
      	const transformer = (context: ts.TransformationContext) => {
        	return (rootNode: ts.SourceFile) => {
          		function visit(node: ts.Node, inLoop = false): ts.Node {


        			if (ts.isVariableDeclaration(node) && node.initializer && ts.isFunctionExpression(node.initializer)) {
                		if (ts.isIdentifier(node.name) && targetVariableNames.has(node.name.text)) {
                    		const updatedFunction = convertToAsyncGenerator(node.initializer, visit, inLoop);
                    		return ts.factory.updateVariableDeclaration(
                        		node,
                        		node.name,
                        		node.exclamationToken,
                        		node.type,
                        		updatedFunction
                    		);
                		}
              		}
            		// 直接のイベント代入の検知と変換
            		if (isTargetEventAssignment(node)) {
                		const binaryExpr = node as unknown as  ts.BinaryExpression;
                		const rightExpr = binaryExpr.right;

		                if (ts.isFunctionExpression(rightExpr)) {
        		            const updatedFunction = convertToAsyncGenerator(rightExpr, visit, inLoop);
                		    return ts.factory.updateBinaryExpression(
                        		binaryExpr,
        		                binaryExpr.left,
                		        binaryExpr.operatorToken,
                        		updatedFunction
                    		);
                		}
            		}
// 繰り返し構文の検知と書き換え
            		if (
                		ts.isForStatement(node) ||
                		ts.isForInStatement(node) ||
                		ts.isForOfStatement(node) ||
                		ts.isWhileStatement(node) ||
                		ts.isDoStatement(node)
            		) {
                		if (hasSkipComment(node, rootNode)) {
                    		return ts.visitEachChild(node, (n) => visit(n, false), context);
                		}

		                if (ts.isForStatement(node)) {
        		            const _node = node as ts.ForStatement
                		    const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
                    		return ts.factory.updateForStatement(node, _node.initializer, _node.condition, _node.incrementor, updatedBody);
                		}
                		if (ts.isForInStatement(node)) {
                    		const _node = node as ts.ForInStatement
                    		const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
                    		return ts.factory.updateForInStatement(node, _node.initializer, _node.expression, updatedBody);
                		}
                		if (ts.isForOfStatement(node)) {
                    		const _node = node as ts.ForOfStatement;
                    		const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
                    		return ts.factory.updateForOfStatement(node, _node.awaitModifier, _node.initializer, _node.expression, updatedBody);
                		}
                		if (ts.isWhileStatement(node)) {
                    		const _node = node as ts.WhileStatement;
                    		const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
            		        return ts.factory.updateWhileStatement(node, _node.expression, updatedBody);
                		}
    		            if (ts.isDoStatement(node)) {
            		        const _node = node as ts.DoStatement;
                    		const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
    		                return ts.factory.updateDoStatement(node, updatedBody, _node.expression);
            		    }
            		}

		            // ループ内の if 文の検知
        		    if (inLoop && ts.isIfStatement(node)) {
                		const _node = node as ts.IfStatement;
		                const newThen = transformIfBody(_node.thenStatement, (n) => visit(n, true));
        		        const newElse = _node.elseStatement ? transformIfBody(_node.elseStatement, (n) => visit(n, true)) : undefined;
                		return ts.factory.updateIfStatement(node, _node.expression, newThen, newElse);
		            }

					// 💡 呼び出し式の末尾の識別子（waitなど）に絞り込んで Symbol を取得
					if (ts.isCallExpression(node)) {
	    				let targetExpression = node.expression;
						if (ts.isCallExpression(node)) {
							if (ts.isPropertyAccessExpression(node.expression)) {
								if( node.expression.name.getText() == 'wait' ) {
									const leftNode = node.expression.expression; // "sprite.Control" の部分
									const leftType = typeChecker?.getTypeAtLocation(leftNode);
									if(leftType)
										console.log(`[型チェック] ${leftNode.getText()} の型:`, typeChecker?.typeToString(leftType));

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
												console.log('leadingText=',leadingText)
												if (leadingText.includes('@needsAwait')) {
													// すでに await がついていなければ付与
													if (node.parent && !ts.isAwaitExpression(node.parent)) {
														console.log('await ++++')
														return ts.factory.createAwaitExpression(ts.visitEachChild(node, visit, context));
													}
												}
											}else{
												console.log('definitionNode=', definitionNode);
											}
										}else{
											console.log('declarations=', declarations)
										}
									}
								}
							}
						}

					}
		            return ts.visitEachChild(node, visit, context);
        	    }
		        return ts.visitNode(rootNode, visit) as ts.SourceFile;
        	}
        };

		const result = ts.transform(currentSourceFile, [transformer]);
    	if (!isModified) return null; // 変更がなければ Vite の元の処理に任せる

			const printer = ts.createPrinter();
    		const transformedCode = printer.printNode(ts.EmitHint.SourceFile, result.transformed[0], currentSourceFile);
    		return {
        		code: transformedCode,
        		map: null,
    		};
		}
	};
}
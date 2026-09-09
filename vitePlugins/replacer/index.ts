import * as ts from 'typescript';
import type { Plugin } from 'vite';
import * as path from 'path';
import { Project, VariableDeclaration } from 'ts-morph';
import { isTargetEventAssignment, hasSkipComment } from '../vite-plugin-ts-code-replacer/utils/plugins-helpers.ts';
import { convertToAsyncGenerator, transformIfBody, transformLoopBody } from '../vite-plugin-ts-code-replacer/transformers/transformer.ts';

import { isAwaitAddTransformerVist } from './helper.ts';

// パフォーマンス向上のため、Projectインスタンスはファイル間で使い回す（シングルトン）
let project: Project | null = null;

function getOrInitProject(rootPath: string): Project {
    if (project) return project;

    project = new Project({
        compilerOptions: { target: 99 /* ESNext */ },
        skipAddingFilesFromTsConfig: true, // 高速化
    });

    return project;
}


export function vitePluginAutoAwait(): Plugin {
	let program: ts.Program | null = null;
	const targetVariableNames = new Set<string>();
	const inMemoryCache = new Map<string, string>();
	let compilerOptions: ts.CompilerOptions = {};
	let configFileNames: string[] = [];
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
			compilerOptions = {
				...configParseResult.options,
				//target: ts.ScriptTarget.ES2022,
		        //module: ts.ModuleKind.ESNext,
        		sourceMap: true,       // 🚨 これにより、emit時に元の位置に紐づくマップが自動生成されます
        		inlineSources: true,   // 元のコードをマップに含める
				//noEmit : false,
				//emitDeclarationOnly: false,
			}
			compilerOptions.experimentalDecorators = false;
			configFileNames = configParseResult.fileNames;

	      	// プロジェクト全体のファイルを最初からすべて含んだ Program を作成
    	  	program = ts.createProgram(configParseResult.fileNames, compilerOptions);
    	},
		buildEnd() {
			targetVariableNames.clear();
			inMemoryCache.clear();
			program = null;
		},
	    transform(code, id) {
    		// node_modules やに対象外のファイルはスルー
    		if (!id.endsWith('.ts') && !id.endsWith('.tsx') || id.includes('node_modules')) return null;
    		if (!id.includes('testV2')) return null; // testV2 のときだけ実行する
    		if (!program) return null;
			//const typeChecker = program.getTypeChecker();



			// HMR（ファイルの書き換え）対応：必要に応じてプログラムを再作成
			const normalizedId = path.normalize(id).replace(/\\/g, '/');
			// 💡 1. 【超重要】Viteが検知した「エディタからの最新コード」をインメモリに即時上書き保存
    		inMemoryCache.set(normalizedId, code);
			// 💡 2. 【超重要】ファイル読み込みをインターセプトするカスタムホストを作成
    		const defaultHost = ts.createCompilerHost(compilerOptions);
			const customHost: ts.CompilerHost = {
				...defaultHost,
				// TypeScript がファイルを要求した時、メモリに最新の修正コードがあればそれをパースして返す
				getSourceFile: (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
        			const normFileName = path.normalize(fileName).replace(/\\/g, '/');
        			if (inMemoryCache.has(normFileName)) {
            			return ts.createSourceFile(
            				fileName,
            				inMemoryCache.get(normFileName)!, // 最新の保存コード
            				languageVersion,
            				true // setParentNodes: true
            			);
          			}
        			return defaultHost.getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
        		},
        		fileExists: (fileName) => {
        			const normFileName = path.normalize(fileName).replace(/\\/g, '/');
        			return inMemoryCache.has(normFileName) || defaultHost.fileExists(fileName);
        		}
			}
			// 💡 3. 【超重要】最新の変更状態を反映した状態で Program と TypeChecker をビルドする
    		// これを挟まないと、何回保存しても初期状態のコードがトランスフォームされ続けます
    		program = ts.createProgram([...configFileNames, normalizedId], compilerOptions, customHost);
      		const typeChecker = program.getTypeChecker();
			const currentSourceFile = program.getSourceFile(normalizedId);
			if (!currentSourceFile) return null;

	      	let isModified = false;

			
			const mainTransformer = (context: ts.TransformationContext) => {
				//console.log('awaitAddTransformer[1]')
    	    	return (rootNode: ts.SourceFile) => {
        	  		function visit(node: ts.Node, inLoop = false): ts.Node {
						// 💡 呼び出し式の末尾の識別子（waitなど）に絞り込んで Symbol を取得
						//console.log('awaitAddTransformer[2]')
						if (ts.isCallExpression(node)) {
							const needsAwait: boolean = isAwaitAddTransformerVist(node, typeChecker);
							if( needsAwait ) {
								const awaitNode = ts.factory.createAwaitExpression(ts.visitEachChild(node, visit, context)) ;
								// 置換前のオリジナルノード（node）の開始・終了位置を、新ノードに100%引き継ぎます
								ts.setTextRange(awaitNode, node);
								isModified = true;
								return awaitNode;
							}
						}
						if (ts.isVariableDeclaration(node) && node.initializer && ts.isFunctionExpression(node.initializer)) {
	    	            	if (ts.isIdentifier(node.name) && targetVariableNames.has(node.name.text)) {
    	    	            	const updatedFunction = convertToAsyncGenerator(node.initializer, visit, inLoop);
        	    	        	const variableNode = ts.factory.updateVariableDeclaration(
            	    	    		node,
                		    		node.name,
                	    			node.exclamationToken,
                    				node.type,
                    				updatedFunction
	                			);
								ts.setTextRange(variableNode, node);
								isModified = true;
								return variableNode;
    	            		}
        	      		}
						// 直接のイベント代入の検知と変換
            			if (isTargetEventAssignment(node)) {
                			const binaryExpr = node as unknown as  ts.BinaryExpression;
                			const rightExpr = binaryExpr.right;

			                if (ts.isFunctionExpression(rightExpr)) {
    	    		            const updatedFunction = convertToAsyncGenerator(rightExpr, visit, inLoop);
        	        		    const updateBinaryExpression = ts.factory.updateBinaryExpression(
            	            		binaryExpr,
        			                binaryExpr.left,
                			        binaryExpr.operatorToken,
                        			updatedFunction
                    			);
								ts.setTextRange(updateBinaryExpression, node);
								isModified = true;
								return updateBinaryExpression;
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
                    			const forStatement = ts.factory.updateForStatement(node, _node.initializer, _node.condition, _node.incrementor, updatedBody);
								ts.setTextRange(forStatement, node);
								isModified = true;
								return forStatement;
							}
	                		if (ts.isForInStatement(node)) {
    	                		const _node = node as ts.ForInStatement
        	            		const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
            	        		const forInStatemnet = ts.factory.updateForInStatement(node, _node.initializer, _node.expression, updatedBody);
								ts.setTextRange(forInStatemnet, node);
								isModified = true;
								return forInStatemnet;
							}
                			if (ts.isForOfStatement(node)) {
                    			const _node = node as ts.ForOfStatement;
                    			const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
                    			const forOfStatement = ts.factory.updateForOfStatement(node, _node.awaitModifier, _node.initializer, _node.expression, updatedBody);
								ts.setTextRange(forOfStatement, node);
								isModified = true;
								return forOfStatement;
							}
    	            		if (ts.isWhileStatement(node)) {
        	            		const _node = node as ts.WhileStatement;
            	        		const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
            			        const whileStatement = ts.factory.updateWhileStatement(node, _node.expression, updatedBody);
								ts.setTextRange(whileStatement, node);
								isModified = true;
								return whileStatement;
							}
    		            	if (ts.isDoStatement(node)) {
            		        	const _node = node as ts.DoStatement;
    	                		const updatedBody = transformLoopBody(_node.statement, (n) => visit(n, true), id);
    			                const doStatement = ts.factory.updateDoStatement(node, updatedBody, _node.expression);
								ts.setTextRange(doStatement, node);
								isModified = true;
								return doStatement;
							}
            			}

			            // ループ内の if 文の検知
    	    		    if (inLoop && ts.isIfStatement(node)) {
        	        		const _node = node as ts.IfStatement;
		    	            const newThen = transformIfBody(_node.thenStatement, (n) => visit(n, true));
        			        const newElse = _node.elseStatement ? transformIfBody(_node.elseStatement, (n) => visit(n, true)) : undefined;
                			const ifStatement = ts.factory.updateIfStatement(node, _node.expression, newThen, newElse);
							ts.setTextRange(ifStatement, node);
							isModified = true;
							return ifStatement;
						}				
			            return ts.visitEachChild(node, visit, context);
					}
					return ts.visitNode(rootNode, visit) as ts.SourceFile;
				}
			};
			//console.log('==========[001]============')
			// 1. パブリックな ts.transform を実行
    		const result = ts.transform(currentSourceFile, [mainTransformer]);
    		if (!isModified) {
				//console.log('=====[001] isModified=', isModified,  currentSourceFile.fileName);
				return null;
			}
			const transformedSourceFile = result.transformed[0];
			// 2. 公式にサポートされている SourceMapGenerator を手動で作成
      		const _compilerOptions = program!.getCompilerOptions();
      		const sourceMapGenerator = (ts as any).createSourceMapGenerator(
        		ts.sys,
        		id,
        		'.',
        		'.',
        		_compilerOptions
    		);

			// 💡 3. 【超重要】プリンターを作成する際、変換結果に含まれる通知フック（emitNodeWithNotification）を渡します
    		// これを渡すことで、printer.printFile 実行時にノードが印刷されるたびに位置情報が追跡されます
    		const printer = ts.createPrinter(
    			{ removeComments: false },
        		{
        		// 🚨 変換されたノードの通知イベントをプリンターと共有します
        		onEmitNode: result.emitNodeWithNotification
    			}
    		);
			// 💡 4. これにより、印刷と同時に sourceMapGenerator の内部にマッピングデータが全自動で蓄積されます
    		const finalCode = printer.printFile(transformedSourceFile);

    		// 5. ジェネレーターから安全にプレーンなマップオブジェクトを回収
    		const rawMapStr = sourceMapGenerator.toJSON();
    		const mapObject = typeof rawMapStr === 'string' ? JSON.parse(rawMapStr) : JSON.parse(JSON.stringify(rawMapStr));

    		// 6. ブラウザ F12 用のパス解決（元TS と 変換後JS の2面表示に対応）
    		const projectRoot = process.cwd().replace(/\\/g, '/');
    		let relativePath = id.replace(/\\/g, '/').replace(projectRoot, '');
    		if (!relativePath.startsWith('/')) relativePath = '/' + relativePath;

			const transformedPath = relativePath.replace(/\.tsx?$/, '.js') + '?transformed';

    		// 元ソースと、変換後のソースの両方を sources / sourcesContent にセットする
    		mapObject.sources = [relativePath, transformedPath];
    		mapObject.sourcesContent = [code, finalCode];

    		const safeMap = {
        		version: mapObject.version || 3,
        		file: path.basename(id),
        		sources: mapObject.sources,
        		sourcesContent: mapObject.sourcesContent,
        		mappings: mapObject.mappings, // これで高精度な mappings が取り出せます
        		names: mapObject.names || []
      		};

    		// 7. Base64 形式にエンコードしてインラインソースマップとして追記
    		const mapJsonString = JSON.stringify(safeMap);
    		const base64Map = Buffer.from(mapJsonString).toString('base64');
      		const sourceMappingComment = `\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64Map}`;

      		return {
        		code: finalCode + sourceMappingComment,
        		map: safeMap
      		};		
		}
	}
}
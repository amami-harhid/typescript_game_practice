/* eslint-disable @typescript-eslint/no-explicit-any */
// 1. メタデータを一時的に格納するコンテナ
const registry: { className: string, methods: string[] }[] = [];
// クラスごとに一時的にメソッド名を溜めるバッファ
let currentClassMethods: string[] = [];
// 2. メソッドデコレータ @Fuga の定義
function Fuga<This, Args extends any[], Return>(
	originalMethod: (...args: Args) => Promise<Return>,
	context: ClassMethodDecoratorContext<This, (...args: Args) => Promise<Return> | Return>
) {
	// 検出したメソッド名をバッファに追加
	const methodName = String(context.name);
	currentClassMethods.push(methodName);
	return originalMethod;
}
// 3. クラスデコレータ @Hoge の定義
function Hoge<Class extends abstract new (...args: any[]) => any>(
  value: Class,
  context: ClassDecoratorContext<Class>
) {
	const className = String(context.name);  
	// @Fuga が付いたメソッドがあればレジストリに登録
	if (currentClassMethods.length > 0) {
    	registry.push({
			className: className,
			methods: currentClassMethods,
		});
	}
	// 次のクラスのためにバッファをクリア
	currentClassMethods = [];
	return value;
}

// ==========================================
// 4. デコレータの使用例
// ==========================================

@Hoge
class UserService {
  @Fuga
  async getUser() {}

  // @Fuga がないので無視される
  async deleteUser() {}

  @Fuga
  async updateUser() {}
}

@Hoge
class OrderService {
  @Fuga
  async createOrder() {}
}

// ==========================================
// 5. 収集したメタデータを XML に変換・格納
// ==========================================
function generateXml(): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<DecoratedElements>\n';
  
  for (const item of registry) {
    xml += `  <Class name="${item.className}">\n`;
    for (const method of item.methods) {
      xml += `    <Method name="${method}" decorator="Fuga" />\n`;
    }
    xml += `  </Class>\n`;
  }
  
  xml += '</DecoratedElements>';
  return xml;
}

console.log(UserService);
console.log(OrderService)

// XMLの出力・格納
const resultXml = generateXml();

console.log(resultXml);
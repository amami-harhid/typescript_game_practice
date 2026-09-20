# typescript_game_practice

## Vite Plugin 

Viteを起動することで、TSファイルのコード置換を行います。

置換１段目⇒置換２段目⇒置換３段目の順でコードを置換します。

また、コードMapを付加しますので、ブラウザ(F12のsources)にてデバッグができます。


## 置換１段目

特定のセッターに関数を入れている場合、それを AsyncGenerator関数(async function*)へと置換します。
```typescript
// index.ts

sprite.Thread.func = function(this:Sprite) {

}

// ↓ 下の形に置換します
sprite.Thread.func = async function* (this:Sprite) {

}
```

また、特定のセッターに変数（const)を入れている場合、変数(const)を宣言している箇所を探索し、置換します。
```typescript
// index.ts

const threadA = function(this:Sprite) {

}
sprite.Thread.func = threadA;

// ↓ 下の形に置換します
const threadA = async function* (this:Sprite) {

}
sprite.Thread.func = threadA;
```

また、変数(const)を宣言している箇所が外部にあるときも、探索して置換します。
```typescript
// index.ts
import { threadA } from './sub';

```

```typescript
// sub.ts

export const threadA = function(this:Sprite) {

}

// ↓ 下の形に置換します
export const threadA = async function* (this:Sprite) {

}
```

### 特定のセッターとは？

２つの条件(AND)が成り立つセッターです。
- targetThreadSetter.jsonで定義している文字列の並びに該当する
- TagMarks.ts で定義する 『THREAD_SETTER_COMMENT』のタグが、JSDocの中に存在する

### アロー関数の扱い

アロー関数をスレッドへ代入することを禁止しています。
エラーになりますので、一般的なfunction式に修正してください。

## 置換２段目

対象のメソッドを呼び出すとき、await を付与します。

```typescript

sprite.Control.wait( 2 ); // 2秒待つ
const threadA = function(this:Sprite) {
    this.Control.wait( 1 ); // 1秒待つ
}
sprite.Thread.func = threadA;

// ↓ 下の形に置換します【await を付与】
await sprite.Control.wait( 2 ); // 2秒待つ
const threadA = async function* (this:Sprite) {
    await this.Control.wait( 1 ); // 1秒待つ 
}
sprite.Thread.func = threadA;
```

### 特定のメソッドとは？

２つの条件(AND)が成り立つメソッドです。
- awaitTargets.jsonで定義している文字列の並びに該当する
- TagMarks.ts で定義する 『NEEDS_AWAIT_METHOD_COMMENT』のタグが、JSDocの中に存在する


### 例外

await付与対象のメソッドの親関数があり、親関数に async がついていないとき、エラーとします。

そのときは親関数をasyncに自分で変更してください。 

```typescript
const errorPattern = function() {
    sprite.Control.wait( 3 ); // 3秒待つ
}

// ↑ asyncでない関数の中では【await】を使えないので、エラーメッセージを表示します（置換は中断します）

```


## 置換３段目

繰り返しループ構文があるとき、`yield` を追加します。
`yield`を追加する場所は、`break`の直前、`continue`の直前、繰り返しブロックの最後の行です。

```typescript
const threadA = function(this:Sprite) {
    for(;;) {
        if( 条件A ) {
            break;
        }
        if( 条件B ) {
            continue;
        }
        // 何かの処理
    }
}
sprite.Thread.func = threadA;

// ↓ 下の形に置換します【yield を付与】

const threadA = function(this:Sprite) {
    for(;;) {
        if( 条件A ) {
            yield; // ← 追加
            break;
        }
        if( 条件B ) {
            yield; // ← 追加
            continue;
        }
        // 何かの処理
        yield; // ← 追加
    }
}
sprite.Thread.func = threadA;
```

### 対象としているループ構文の種類

以下の繰り返しは無限ループの可能性があり、無限ループの場合にはブラウザがハングしてしまう。
ブラウザハングを開始するために、繰り返し１回ごとにいったん休止させる( yield をいれる )。
for...of, for...in構文は無限ループにはならないが、for構文と近しい構文であり`yield`対応に含めている。

- for 構文
- while 構文
- do 構文
- for...of 構文
- for...in 構文

### 対象としていない繰り返し構文

以下は、配列を処理する構文であり無限ループにはならないこと、`yield`を入れることが難しいことから
対象外とする

- forEach
- Array.some
- Array.filter
- その他 Array.～系の繰り返し


### 例外（１）

繰り返し文の直前に『スキップマーク』のコメントを付けることで、yieldを付与しないとできる

次のコードには `yield`を付与しない。繰り返し１回ごとの『いったん休止』をしないので、動作結果は自己責任で。

```typescript
    // @ts-loop-yield-skip
    for(;;) {
        // 何かの処理
    }

```

### 例外（２）

`yield`を入れる対象の繰り返し文があり、それが次が成り立つときは、エラーメッセージを表示する

- 親関数を持ち、かつ
- 親関数が Generator関数( または AsyncGenerator関数 )でない

なお、『スキップマーク』のコメントがあるときは、上の条件が成立してもエラーにはしない。

### 例外（３）

TSファイルのパスが`**/lib/**`の場合、`**/node_modules/**`の場合、`yield`付与対応は行わない。


## TODO

定義先が `**/lib/**` , `**/node_modules/**` の場合、または Viteの対象外の場合はエラーにする。

動的に変化するメソッド、変数、リテラルオブジェクトなどは追跡不能。静的なコードによる追跡のみが有効。

tracer.ts の中の find() は対象の最初の１個だけを返す仕組み、２個以上の場合に漏れが生じる。
filter() で対象の全てを取得し、配列処理をしないといけない。

```typescript
const propertyDecl = declarations.find(d => d.getKind() === SyntaxKind.PropertyAssignment);
```
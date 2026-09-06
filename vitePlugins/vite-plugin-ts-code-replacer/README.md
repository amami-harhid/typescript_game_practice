# VITE PLUGINS

## feature (機能)

### target
src/testV2 配下の TSファイルのときに ソースコード変換を行う

### code conversion
#### 【01】非同期のGenerator関数

`XXX.Thread.func = 〇〇` としてセットする`function()` を `async function* ()` に変換する 

##### Pattern 
```typescript
const thread01 = function(this:Sprite) {

}
sprite.Thread.func = thread01;
```
↓ : 非同期のGenerator関数にする
```typescript
const thread01 = async function* (this:Sprite) {

}
sprite.Thread.func = thread01;
```

##### Pattern 2 
```typescript
sprite.Thread.func = function(this:Sprite) {

}
```
↓ : 非同期のGenerator関数にする
```typescript
sprite.Thread.func = async function* (this:Sprite) {

}
```

#### 【02】ループ文にyieldを追加する

##### Pattern 1
```typescript
sprite.Thread.func = function(this:Sprite) {
    for(;;) {
        // 何かのコード
    }
}
```
↓ : ループの最後に`yield`をつける
```typescript
sprite.Thread.func = async function* (this:Sprite) {
    for(;;) {
        // 何かのコード
        yield;
    }
}
```

##### Pattern 2
```typescript
sprite.Thread.func = function(this:Sprite) {
    for(;;) {
        // 何かのコード
        // 終わる条件
        if( xxxx ) {
            break;
        }
    }
}
```
↓ : `break`の前に`yield`をつける
```typescript
sprite.Thread.func = async function* (this:Sprite) {
    for(;;) {
        // 何かのコード
        // 終わる条件
        if( xxxx ) {
            yield;
            break;
        }
        yield;
    }
}
```

##### Pattern 3

```typescript
sprite.Thread.func = function(this:Sprite) {
    for(;;) {
        // 何かのコード(A)
        // スキップ条件
        if( xxxx ) {
            continue;
        }
        // 何かのコード(B)
    }
}
```
↓ : `continue`の前に`yield`をつける
```typescript
sprite.Thread.func = async function* (this:Sprite) {
    for(;;) {
        // 何かのコード(A)
        // スキップ条件
        if( xxxx ) {
            yield;
            continue;
        }
        // 何かのコード(B)
        yield;
    }
}
```
##### Pattern 4

`@ts-loop-yield-skip`を直前につけると、`yield`が追加されない

```typescript
// @ts-loop-yield-skip
for(;;) {
    // 何かのコード
}
```
↓ : `yield`をつけない

```typescript
// @ts-loop-yield-skip
for(;;) {
    // 何かのコード
}
```



#### 【03】非同期のメソッドにawaitをつける

##### Pattern 1
```typescript
sprite.Thread.func = function(this:Sprite) {
    this.Control.wait(1); // 1秒待つ
}
```
↓ : await をつける
```typescript
sprite.Thread.func = async function* (this:Sprite) {
    await this.Control.wait(1); // 1秒待つ
}
```

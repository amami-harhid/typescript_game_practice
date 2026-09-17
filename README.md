# typescript_game_practice

## Vite Plugin 

Viteを起動することで、TSファイルのコード置換を行います。

## TODO

await を付与するとき 
    関数の中であれば、async関数でないときは await をつけずに エラーとする
    関数の中でないときは、await をつける

yield を付与するとき 
    関数の中でないときにループにスキップマークがないときエラー。
    関数の中のときに関数がGenerator関数でないとき、ループにスキップマークがなければエラー。
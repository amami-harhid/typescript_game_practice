/**
 * スプライトに複数の画像を登録
 * costumeインスタンスを生成し、costumeに対して画像を登録する
 * そして表示する画像を切り替えるメソッドを用意する ( constume.next() )
 */

import Cat from '../../../assets/cat.svg';
import Cat2 from '../../../assets/cat2.svg';

import { Sprite } from './sprite';
import { Engine } from './engine';

const sprite = new Sprite();

// スプライトの初期設定
sprite.position.x = window.innerWidth/2;
sprite.position.y = window.innerHeight/2;
sprite.addImage(Cat);
sprite.addImage(Cat2);

/** スプライトのスレッド( 角度を変更 ) */
const loop01 = function(this:Sprite) {
    let counter = 0;
    for(;;){
        this.degree += 5;
        if(counter > 50){
            this.degree = 0; // --> Scratchと異なる
            break;
        }
        counter += 1;
    }
}
/** スプライトのスレッド( 大きさを変更 ) */
const loop02 = function(this:Sprite)  {
    let counter = 0;
    for(;;){
        this.scale.w += 5;
        this.scale.h += 5;
        if(this.scale.w > 300){
            this.scale.w = 100;
            this.scale.h = 100;
        }
        if(counter > 100){
            this.scale.w = 100;
            this.scale.h = 100;
            break;
        }
        counter += 1;
    }
}
/** スプライトのスレッド( 位置X を変更 ) */
const loop03 = function(this:Sprite) {
    let counter = 0;
    for(;;){
        this.position.x += 5;
        if(this.position.x > window.innerWidth){
            this.position.x = 0;
        }
        if(counter > 150){
            this.scale.w = -200; // 左右反転
            this.scale.h = 200;
            break;
        }
        counter += 1;
    }
}

// スレッドを登録 ( 並行動作する )
sprite.Thread.func = loop02;
sprite.Thread.func = loop01;
sprite.Thread.func = loop03;
/** スプライトのスレッド( コスチューム切り替え ) */
sprite.Thread.func = function(this:Sprite) {
    for(;;){
        this.costume.next();
        this.Control.wait(0.1);
    }
};

// スレッドを実行
Engine.run();
/**
 * スプライトに複数の画像を登録
 * costumeインスタンスを生成し、costumeに対して画像を登録する
 * そして表示する画像を切り替えるメソッドを用意する ( constume.next() )
 */

import Cat from '../../../assets/cat.svg';
import Cat2 from '../../../assets/cat2.svg';

import { Sprite } from './sprite';
import { Engine } from './engine';
import * as Control from '../../lib/controls';

const sprite = new Sprite();

// スプライトの初期設定
sprite.position.x = window.innerWidth/2;
sprite.position.y = window.innerHeight/2;
sprite.addImage(Cat);
sprite.addImage(Cat2);

/** スプライトのスレッド( 角度を変更 ) */
const loop01 = async function*(this:Sprite) {
    let counter = 0;
    for(;;){
        this.degree += 5;
        if(counter > 30000){
            break;
        }
        counter += 1;
        yield;
    }
}
/** スプライトのスレッド( 大きさを変更 ) */
const loop02 = async function*(this:Sprite) {
    for(;;){
        this.scale.w += 5;
        this.scale.h += 5;
        if(this.scale.w > 300){
            this.scale.w = 100;
            this.scale.h = 100;
        }
        yield;
    }
}
/** スプライトのスレッド( 位置X を変更 ) */
const loop03 = async function*(this:Sprite) {
    for(;;){
        this.position.x += 5;
        if(this.position.x > window.innerWidth){
            this.position.x = 0;
        }
        yield;
    }
}
/** スプライトのスレッド( 位置X を変更 ) */
const loop04 = async function*(this:Sprite) {
    for(;;){
        this.costume.next();
        await Control.wait(0.1);
        yield;
    }
}

// スレッドを登録 ( 並行動作する )
Engine.addThread( loop01.bind(sprite) );
Engine.addThread( loop02.bind(sprite) );
Engine.addThread( loop03.bind(sprite) );
Engine.addThread( loop04.bind(sprite) );

// スレッドを実行
Engine.run();
/**
 * スプライトに複数の画像を登録
 * costumeインスタンスを生成し、costumeに対して画像を登録する
 * そして表示する画像を切り替えるメソッドを用意する ( constume.next() )
 */

import { Sprite } from './lib/sprite';
import { Engine } from './lib/engine';
import Cat from '../../../assets/cat.svg';

const sprite = new Sprite();
sprite.addImage(Cat);

sprite.position.x = window.innerWidth/2;
sprite.position.y = window.innerHeight/2;

sprite.Control.wait(0.1);


let muki = 1;
const speed = 5;
sprite.Thread.func = function (this:Sprite){
    this.degree = 0;
    this.Control.wait(1);
    // ずっと繰り返す
    for(;;){
        this.degree += speed * muki;
    }
}
const test3 = function (this:Sprite){
    // ずっと繰り返す
    for(;;){

        if(this.degree == 0){
            continue;
        }
        if(this.degree == 90){
            break;
        }
        this.Control.wait(3);
        muki *= -1;

    }
}
sprite.Thread.func = test3;

Engine.run();
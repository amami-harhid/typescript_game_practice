/**
 * スプライトに複数の画像を登録
 * costumeインスタンスを生成し、costumeに対して画像を登録する
 * そして表示する画像を切り替えるメソッドを用意する ( constume.next() )
 */

import { Sprite } from './lib/sprite';
import { Engine } from './lib/engine';
import Cat from '../../../assets/cat.svg';
import { test2 } from './sub/threads';

const sprite = new Sprite();
sprite.addImage(Cat);

sprite.position.x = window.innerWidth/2;
sprite.position.y = window.innerHeight/2;

sprite.Control.wait(1);


let muki = -1;
const speed = 6;
const test = function() {
    return true;
}
console.log(test());
if(muki == -1) {
const test = async function* (this:Sprite) {
    this.degree = 20;
    // ずっと繰り返す
    for(;;){

        if(this.degree == 0){
            continue;
        }
        if(this.degree == 90){
            break;
        }
        this.Control.wait(2);
        muki *= -1;

    }
}
sprite.Thread.func = test;

}

sprite.Thread.func = function (this:Sprite){
    this.degree = 15;
    this.Control.wait(3);
    // ずっと繰り返す
    for(;;){
        this.degree += speed * muki;
        this.position.x += 1 * positionFlg;
    }
}
let positionFlg = -1;

sprite.Thread.func = () => {
    for(;;){
        (this as unknown  as Sprite).Control.wait(0.5);
        positionFlg *= -1;
    }
}

sprite.Thread.func = test2

Engine.run();
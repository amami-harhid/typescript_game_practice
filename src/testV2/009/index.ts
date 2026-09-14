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

sprite.Control.wait(1);


let muki = -1;
const speed = 5;
const test = function() {
    return true;
}
console.log(test());
if(muki == -1) {
const test = function(this:Sprite) {
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
    this.degree = 10;
    this.Control.wait(3);
    // ずっと繰り返す
    for(;;){
        this.degree += speed * muki;
        this.position.x += 1 * positionFlg;
    }
}
let positionFlg = -1;
const start = function(this:Sprite) {

    this.Thread.func = () => {
        for(;;){
            this.Control.wait(1);
            positionFlg *= -1;
        }
    }

}
start.bind(sprite)();


Engine.run();
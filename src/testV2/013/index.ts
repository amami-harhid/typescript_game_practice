import './sub/style.css'; 
/**
 * 初期表示時に 背景赤で『緑の旗』を表示
 * 旗クリックすると スレッドが動き出す動きを作る
 */

//import { Sprite } from './lib/sprite';
import { Engine } from './lib/engine';
import Cat from '../../../assets/cat.svg';
import { threadObj } from './sub/threads';
import { CustomSprite } from './sub/customSprite';


const sprite = new CustomSprite();
sprite.addImage(Cat);

sprite.Thread.func = threadObj.thread4;

sprite.position.x = window.innerWidth/2;
sprite.position.y = window.innerHeight/2;

sprite.Control.wait(0.1);


let muki = -1;
const speed = 6;

const test001 = function (this:CustomSprite) {

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
    
sprite.Thread.func = test001;
// console.log(test());

sprite.Thread.func = function (this:CustomSprite){
    this.degree = 15;
    this.Control.wait(0.2);
    // ずっと繰り返す
    for(;;){
        this.degree += speed * muki;
        this.position.x += 1 * positionFlg;
    }
}
let positionFlg = -1;

sprite.Thread.func = function() {
    for(;;){
        (this as unknown  as CustomSprite).Control.wait(2);
        positionFlg *= -1;
    }
}

Engine.run();

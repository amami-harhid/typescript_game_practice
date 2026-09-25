import './sub/style.css'; 
/**
 * スプライトに複数の画像を登録
 * costumeインスタンスを生成し、costumeに対して画像を登録する
 * そして表示する画像を切り替えるメソッドを用意する ( constume.next() )
 */

//import { Sprite } from './lib/sprite';
import { Engine } from './lib/engine';
import Cat from '../../../assets/cat.svg';
import { threadObj } from './sub/threads';
import { CustomSprite } from './sub/customSprite';


const sprite = new CustomSprite();
sprite.addImage(Cat);

// sprite.Thread.func = ()=>{
    
// };

sprite.Thread.func = threadObj.thread4;

sprite.position.x = window.innerWidth/2;
sprite.position.y = window.innerHeight/2;

sprite.Control.wait(0.1);


let muki = -1;
const speed = 6;

// const test = function() {
//     return true;
// }


const test3 = function (this:CustomSprite) {

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
    
sprite.Thread.func = test3;
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

const body = document.querySelector('body') as HTMLBodyElement;
const greenFlag = document.querySelector('#greenFlag') as HTMLDivElement;
window.addEventListener('click', ()=>{
    const w = window.innerWidth;
    const h = window.innerHeight;
    greenFlag.style = `display:block;width:${w}px;height:${h}px;background-color:red;`;
    window.addEventListener('click', function(){
        body.style = "background-color: #00000000"
        greenFlag.style = "position:absolute; display: none; width:100%;height:800px;"
        Engine.run();
    });

});

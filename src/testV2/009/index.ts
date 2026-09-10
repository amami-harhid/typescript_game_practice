/**
 * スプライトに複数の画像を登録
 * costumeインスタンスを生成し、costumeに対して画像を登録する
 * そして表示する画像を切り替えるメソッドを用意する ( constume.next() )
 */

import { Sprite } from '../008/lib/sprite';
import { Engine } from '../008/lib/engine';
import Cat from '../../../assets/cat.svg';
const sprite = new Sprite();
sprite.addImage(Cat);
sprite.position.x = window.innerWidth/2;
sprite.position.y = window.innerHeight/2;
sprite.Control.wait(0.1);

sprite.Thread.func = function(this:Sprite){
    //this.Control.wait(0.2);
    for(;;){
        this.degree += 5;
        this.Control.wait(0.03);
    }
}
Engine.run();
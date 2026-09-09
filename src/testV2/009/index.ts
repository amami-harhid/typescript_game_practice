/**
 * スプライトに複数の画像を登録
 * costumeインスタンスを生成し、costumeに対して画像を登録する
 * そして表示する画像を切り替えるメソッドを用意する ( constume.next() )
 */

import { Sprite } from '../008/sprite';
import { Engine } from '../008/engine';
import Cat from '../../../assets/cat.svg';
const sprite = new Sprite();
sprite.addImage(Cat);
sprite.Control.wait(10);

sprite.Thread.func = function(this:Sprite){
    this.Control.wait(10);
    for(;;){
        this.degree += 25;
        this.Control.wait(0.1);
    }
}
Engine.run();
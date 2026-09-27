/**
 * import(style.css)をengine.ts の中へ移動
 * style.css を lib/css へ移動
 * 旗クリックしたときのイベントを用意する
 * 旗クリックされたときに スレッドをEngineへ追加する
 */

import { Sprite } from './lib/sprite';
import { Engine } from './lib/engine';
import Cat from '../../../assets/cat.svg';

const sprite = new Sprite();
sprite.addImage(Cat);

sprite.position.x = window.innerWidth/2;
sprite.position.y = window.innerHeight/2;

sprite.Control.wait(0.1);

const test001 = function (this:Sprite) {
    console.log('test001 started!!!');
    this.degree = 0;
    // let counter = 0;
    // ずっと繰り返す
    for(;;){
        this.degree += 5;
        this.Control.wait(0);
        // console.log('test01 counter=', counter);
        // counter += 1;
    }
}

const test002 = function (this:Sprite) {
    console.log('test002 started!!!');
    this.degree = 0;
    // let counter = 0;

    // ずっと繰り返す
    for(;;){
        this.degree -= 25;
        this.Control.wait(0);
        // console.log('test02 counter=', counter);
        // counter += 1;
    }
}

sprite.Event.flagPresser().func = test001;

sprite.Event.flagPresser().func = test002;

Engine.run();

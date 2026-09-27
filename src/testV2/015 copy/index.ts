/**
 * メッセージ送信のイベントを用意する
 */

import { Sprite } from './lib/sprite';
import { Engine } from './lib/engine';
import Cat from '../../../assets/cat.svg';

const sprite = new Sprite();
sprite.addImage(Cat);

sprite.position.x = window.innerWidth/2;
sprite.position.y = window.innerHeight/2;

sprite.Control.wait(0.1);
let counter = 0;
const test001 = function (this:Sprite) {
    console.log('test001 started!!!');
    this.degree = 0;

    this.Control.wait(2);

    counter += 1;

    this.Broadcast.send('ROTATION', counter);
}

const test002 = function (this:Sprite, count: number) {
    console.log('test002 started!!!', count);
    this.degree = 0;
    let counter = 0;

    // ずっと繰り返す
    for(;;){
        this.degree += 5;
        this.Control.wait(0);
        counter += 1;
        if(counter>50){
            break;
        }
    }

    this.Broadcast.send('NEXT_START');
}

sprite.Event.flagPresser().func = test001;

sprite.Broadcast.receiver('ROTATION').func = test002;

sprite.Broadcast.receiver('NEXT_START').func = test001;

Engine.run();

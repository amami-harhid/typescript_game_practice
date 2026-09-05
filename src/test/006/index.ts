/**
 * オフスクリーン方式を試行する
 * ( スプライトを回転させる )
 * 
 */

import { Loader } from '../../lib/loader';

import Cat from '../../../assets/cat.svg';
import { Sprite } from './sprite';
import { Engine } from './engine';

const svgText = await Loader.loadSvg(Cat);

const sprite = new Sprite();

sprite.position.x = window.innerWidth/2;
sprite.position.y = window.innerHeight/2;
sprite.setSvgImage(svgText);

const loop01 = function*(this:Sprite) {
    let counter = 0;
    for(;;){
        this.degree += 5;
        if(counter > 300){
            break;
        }
        counter += 1;
        yield;
    }
}
const loop02 = function*(this:Sprite) {
    for(;;){
        this.scale.w += 0.05;
        this.scale.h += 0.05;
        if(this.scale.w > 3.0){
            this.scale.w = 1;
            this.scale.h = 1;
        }
        yield;
    }
}
const loop03 = function*(this:Sprite) {
    for(;;){
        this.position.x += 5;
        if(this.position.x > window.innerWidth){
            this.position.x = 0;
        }
        yield;
    }
}

Engine.addThread( loop01.bind(sprite) );
Engine.addThread( loop02.bind(sprite) );
Engine.addThread( loop03.bind(sprite) );

Engine.run();
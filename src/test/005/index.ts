/**
 * オフスクリーン方式を試行する
 * ( スプライトを回転させる )
 * 
 */

import { Loader } from '../../lib/loader';

import Cat from '../../../assets/cat.svg';
import { Sprite } from './sprite';
import { Stage } from './stage';

const svgText = await Loader.loadSvg(Cat);

const stage = new Stage();

const sprite = new Sprite();

sprite.position.x = window.innerWidth/2;
sprite.position.y = window.innerHeight/2;
sprite.setSvgImage(svgText);

setInterval(()=>{
    sprite.draw();
    stage.draw();
    sprite.degree += 5;
    sprite.position.x += 5;
    if(sprite.position.x > window.innerWidth) {
        sprite.position.x = 0;
    }
    sprite.scale = {w: sprite.scale.w + 0.05, h: sprite.scale.h+ 0.05};
    if(sprite.scale.w > 3.0) {
        sprite.scale.w = 1.0
        sprite.scale.h = 1.0
    }
}, 30 );


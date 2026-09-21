import * as Lib from './lib/';
import type { ISprite as Sprite } from './lib/sprite';
import * as Thread from './sub/threads';
import { outSideFunc } from '../../../lib/test';
import * as Custom from './sub/customSprite';

const sprite = new Lib.Sprite();

sprite.Thread.func = Thread.CustomSpriteObj01.thread01_01;

sprite.Thread.func = Thread.CustomSpriteObj01.thread01_02;

sprite.Thread.func = Thread.CustomSpriteObj01.thread01_03;

sprite.Thread.func = Thread.CustomSpriteObj01.thread01_04;

sprite.Thread.func = Thread.CustomSpriteObj02.thread02_01;

sprite.Thread.func = Thread.CustomSpriteObj02.thread02_02;

sprite.Thread.func = Thread.CustomSpriteObj02.thread02_03;

//sprite.Thread.func = Thread.CustomSpriteObj02.thread02_04;

sprite.Thread.func = Thread.obj01.obj01_01;

sprite.Thread.func = Thread.obj01.obj01_02;

sprite.Thread.func = Thread.obj01.obj01_03;

sprite.Thread.func = Thread.obj01.obj01_04;

//sprite.Thread.func = Thread.obj01.obj01_05;

sprite.Thread.func = function(this: Sprite) {
    for(;;)
        //console.log("001 - direct function()")
        this.Control.wait(1);
}

const func001 = function(this: Sprite) {
    for(;;)
        //console.log("002 - direct function()")
        this.Control.wait(1);
}

sprite.Thread.func = func001;

const obj02_01 = Thread.obj02.obj02_01
const obj02_02 = Thread.obj02.obj02_02
const obj02_03 = Thread.obj02.obj02_03
const obj02_04 = Thread.obj02.obj02_04

sprite.Thread.func = obj02_01;
sprite.Thread.func = obj02_02;
sprite.Thread.func = obj02_03;
sprite.Thread.func = obj02_04;

//sprite.Thread.func = outSideFunc; //範囲外エラー
// aaa
outSideFunc();

const customSprite01 = new Custom.CustomSprite01();

customSprite01.Thread.func = customSprite01.thread001;
customSprite01.Thread.func = customSprite01.thread002;

type TestObj = {id?:string, func: CallableFunction};
const testObje: TestObj[] = [

    {func: function(this:Sprite) {
        console.log('#00001 ')
    }},
    // {id:"bbb",func: function(this:Sprite) {
    //     console.log('#00002')

    // }},
]

const testObje2 = [

    {func: function(this:Sprite) {
        console.log('#00001 ')
    }},
    {id:"bbb",func: function(this:Sprite) {
        console.log('#00002')

    }},
]
customSprite01.Thread.func = testObje2[100].func;
customSprite01.Thread.func = testObje[0].func;





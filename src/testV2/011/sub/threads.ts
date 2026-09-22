import { CustomSprite01, CustomSprite02 } from "./customSprite";
import { outSideFunc } from '../../../../lib/test';
const customSprite01 = new CustomSprite01();

/**
 * リテラルオブジェクトにCustomSprite01のインスタンスメソッド
 * これをExportして スレッドセッターへ代入するとき
 * スレッド置換を行うことの確認
 */
export const CustomSpriteObj01 = {
    thread01_01: customSprite01.thread001,
    thread01_02: customSprite01.thread002,
    thread01_03: customSprite01.thread003,
    thread01_04: customSprite01.thread004,
}

const customSprite02 = new CustomSprite02();
const customSprite02Thread001 = customSprite02.thread001;
const customSprite02Thread002 = customSprite02.thread002;
const customSprite02Thread003 = customSprite02.thread003;
const customSprite02Thread004 = customSprite02.thread004;
/**
 * CustomSprite02のインスタンスメソッドを
 * 一旦コンスタントに代入し、そのコンスタントを
 * これをExportして スレッドセッターへ代入するとき
 * スレッド置換を行うことの確認
 */
export const CustomSpriteObj02 = {
    thread02_01: customSprite02Thread001,
    thread02_02: customSprite02Thread002,
    thread02_03: customSprite02Thread003,
    thread02_04: customSprite02Thread004,
}

export const obj01 = {
    obj01_01 : function(p:string) {
        for(;;)
            console.log('obj01_01'+p);
    },
    obj01_02 : async function(p:string) {
        for(;;)
            console.log('obj01_02'+p);
    },
    obj01_03 : function*(p:string) {
        for(;;)
            console.log('obj01_03'+p);
    },
    obj01_04 : async function*(p:string) {
        for(;;)
            console.log('obj01_04'+p);
    },
    obj01_05 : () =>{
        // for(;;)
        //     console.log('obj01_04'+p);
    },
};

export const obj02 = {
    obj02_01 : function(p:string) {
        for(;;)
            console.log('obj02_01'+p);
    },
    obj02_02 : async function(p:string) {
        for(;;)
            console.log('obj02_02'+p);
    },
    obj02_03 : function*(p:string) {
        for(;;)
            console.log('obj02_03'+p);
    },
    obj02_04 : async function*(p:string) {
        for(;;)
            console.log('obj02_04'+p);
    },
    // obj01_05 : (p:string) =>{
    //     for(;;)
    //         console.log('obj01_04'+p);
    // },
}

const outSideFunction = outSideFunc;


// @ ts-loop-yield-skip
for(;;){
    console.log('yield付与できない(関数なし)')
    break;
}

async function error (this:CustomSprite02) {
    // @ts-loop-yield-skip
    for(;;){
        console.log('yield付与できない(関数あり)')
        break;
    }
}
error.bind(customSprite02)();

export {outSideFunction}
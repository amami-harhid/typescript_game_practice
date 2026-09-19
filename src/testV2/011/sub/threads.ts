import { Sprite } from "../../../lib/sprite";
import { CustomSprite } from "./customSprite";

export const test2 = async function(this:Sprite) {
    this.degree = 20;
    // ずっと繰り返す
    // @ts-loop-yield-skip
    for(;;){

        if(this.degree == 0){
            continue;
        }
        if(this.degree == 150){
            break;
        }
        this.Control.wait(20);
    }
}
export const test = async function*(this: CustomSprite) {
        for(;;){
            console.log('xxxxxx');
            this.Control.wait(1);
        }
    };
/**
 * リテラルオブジェクト内の関数をスレッドセッターへ
 * 代入するテスト用です
 */
export const threadObj = {
    /**
     * スレッドセッターへ代入していないときのテスト
     * ==> asyncGeneratorでない場合はエラーになる
     * @param this 
     */
    thread: async function*(this: CustomSprite) {
        for(;;){
            //console.log('abcdefg');
            this.Control.wait(1);
        }
    },
    /**
     * アロー関数をスレッドに代入するとエラーになる
     */
    thread2: ()=>{
        console.log('Arrow Function');
    },
    /**
     * リテラルオブジェクトでコンスタントを使うと
     * そのコンスタント(test)まで追跡しないので
     * testの方のfunctionは async function* で
     * ないとエラーになる。追跡の限界である。
     */
    thread3: test,
    /**
     * スレッドへ代入すると asyncGeneratorに変わる
     * @param this 
     */
    thread4: async function*(this: CustomSprite) {
        for(;;){
            //console.log('abcdefg');
            this.Control.wait(1);
        }
    },

}

export class Tester {
    static threadS() {
        console.log('static thread');
    }
    thread() {
        console.log('thread');
    }
}

const test_2 = () => {

    console.log('test2');
}

export {test_2}
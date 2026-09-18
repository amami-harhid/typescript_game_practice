import { controlWait } from "../../../lib/controls";
import { Sprite } from "../../../lib/sprite";

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

export const threadObj = {
    thread: async (aaaa: number=10, bbbb: number=10) => {
        console.log(aaaa, bbbb)
        for(;;){
            console.log('abcdefg');
            await controlWait(1);
        }
    }
}
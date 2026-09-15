import { Sprite } from "../lib/sprite";

export const test2 = function(this:Sprite) {
    this.degree = 20;
    // ずっと繰り返す
    for(;;){

        if(this.degree == 0){
            continue;
        }
        if(this.degree == 12){
            break;
        }
        this.Control.wait(20);
    }
}
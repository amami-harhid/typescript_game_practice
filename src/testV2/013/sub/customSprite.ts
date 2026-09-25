import { Sprite } from '../lib/sprite';

class CustomSprite extends Sprite {

    constructor() {
        super();
        //this.Thread.func = this.thread;
    }

    // async *thread () {
    //     let idx = 0;
    //     for(;;) {
    //         console.log('====='+ (++idx))
    //         this.Control.wait(1.0);
    //     }
    // }

}

export { CustomSprite };
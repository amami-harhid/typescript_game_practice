import { Sprite } from '../lib/sprite';

class CustomSprite01 extends Sprite {

    constructor() {
        super();
        //this.Thread.func = this.thread;
    }
    /**
     * normal
     */
    thread001 () {
        let idx = 0;
        for(;;) {
            console.log('No.001'+ (++idx))
            this.Control.wait(1.0);
        }
    }
    /**
     * async
     */
    async thread002 () {
        let idx = 2;
        for(;;) {
            console.log('No.002'+ (++idx))
            this.Control.wait(1.0);
        }
    }
    /**
     * Generator
     */
    *thread003 () {
        let idx = 3;
        for(;;) {
            console.log('No.003'+ (++idx))
            this.Control.wait(1.0);
        }
    }
    /**
     * AsyncGenerator
     */
    async *thread004 () {
        let idx = 4;
        for(;;) {
            console.log('No.004'+ (++idx))
            this.Control.wait(1.0);
        }
    }

}

class CustomSprite02 extends Sprite {

    constructor() {
        super();
        //this.Thread.func = this.thread;
    }
    /**
     * normal
     */
    thread001 () {
        let idx = 0;
        for(;;) {
            console.log('No.001'+ (++idx))
            this.Control.wait(1.0);
        }
    }
    /**
     * async
     */
    async thread002 () {
        let idx = 2;
        for(;;) {
            console.log('No.002'+ (++idx))
            this.Control.wait(1.0);
        }
    }
    /**
     * Generator
     */
    *thread003 () {
        let idx = 3;
        for(;;) {
            console.log('No.003'+ (++idx))
            this.Control.wait(1.0);
        }
    }
    /**
     * AsyncGenerator
     */
    async *thread004 () {
        let idx = 4;
        for(;;) {
            console.log('No.004'+ (++idx))
            this.Control.wait(1.0);
        }
    }

}


export { CustomSprite01, CustomSprite02 };
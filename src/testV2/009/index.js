/**
 * スプライトに複数の画像を登録
 * costumeインスタンスを生成し、costumeに対して画像を登録する
 * そして表示する画像を切り替えるメソッドを用意する ( constume.next() )
 */
import { Sprite } from './lib/sprite';
import { Engine } from './lib/engine';
import Cat from '../../../assets/cat.svg';
const sprite = new Sprite();
sprite.addImage(Cat);
sprite.position.x = window.innerWidth / 2;
sprite.position.y = window.innerHeight / 2;
sprite.Control.wait(0.1);
sprite.Thread.func = async function* () {
    this.degree = 0;
    // ずっと繰り返す
    // for(;;){
    //     this.degree += 5;
    //     await this.Control.wait(0.03);
    // }
};
const test3 = async function* () {
    this.degree = 0;
    // ずっと繰り返す
    for (;;) {
        this.degree += -45;
        await this.Control.wait(1);
        if (this.degree == 20) {
            yield;
            continue;
        }
        if (this.degree == 30) {
            yield;
            break;
        }
        yield;
    }
};
sprite.Thread.func = test3;
Engine.run();
//# sourceMappingURL=index.js.map
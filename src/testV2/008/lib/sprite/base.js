import { Engine } from "../engine";
import { Costume } from "./costume";
import { Entity } from "../entity";
export class SpriteBase extends Entity {
    _engine;
    _svg = [];
    _costume;
    constructor() {
        super();
        this._engine = Engine.getInstance();
        this._engine.sprites.push(this);
        this._costume = new Costume(this);
    }
    get costume() {
        return this._costume;
    }
    addImage(svg) {
        this._svg.push(svg);
    }
    get Thread() {
        const _me = this;
        return {
            set func(f) {
                const _f = f.bind(_me);
                Engine.addThread(_f);
            }
        };
    }
    draw() {
    }
}
//# sourceMappingURL=base.js.map
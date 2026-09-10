import { Engine } from "../engine";
import { Costume } from "./costume";
import type { ThreadCaller } from "../engine";
import { Entity } from "../entity";
export class SpriteBase extends Entity{

    protected _engine: Engine;
    protected _svg: string[] = [];
    protected _costume: Costume;
    
    constructor() {
        super();
        this._engine = Engine.getInstance();
        this._engine.sprites.push(this);
        this._costume = new Costume(this);
    }
    get costume() {
        return this._costume;
    }
    addImage( svg: string) {
        this._svg.push(svg);
    }
    get Thread() {
        const _me = this;
        return {
            set func(f: ThreadCaller){
                const _f = f.bind(_me);
                Engine.addThread( _f );        
            }
        };
    }
    draw() {
        
    }
}
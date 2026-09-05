import { Engine } from "../engine";
import { Costume } from "./costume";

export class SpriteBase {

    protected _engine: Engine;
    protected _svg: string[] = [];
    protected _costume: Costume;
    
    constructor() {
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
    draw() {
        
    }
}
import { Engine } from "../engine";
export class Stage {

    private _engine: Engine;
    constructor() {
        this._engine = Engine.getInstance();
        this._engine.stage = this;

    }
    draw() {

    }
}
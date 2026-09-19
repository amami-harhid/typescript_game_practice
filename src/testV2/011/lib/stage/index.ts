import { Engine } from "../engine";
import { StageBase } from "./base";
export class Stage extends StageBase {

    private _engine: Engine;
    constructor() {
        super();
        this._engine = Engine.getInstance();
        this._engine.stage = this;

    }
    draw() {

    }
}
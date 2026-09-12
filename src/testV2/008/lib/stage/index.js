import { Engine } from "../engine";
import { StageBase } from "./base";
export class Stage extends StageBase {
    _engine;
    constructor() {
        super();
        this._engine = Engine.getInstance();
        this._engine.stage = this;
    }
    draw() {
    }
}
//# sourceMappingURL=index.js.map
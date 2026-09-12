import { EntityControl } from "./entityControl";
export class Entity {
    _control;
    constructor() {
        this._control = new EntityControl();
    }
    get Control() {
        return this._control;
    }
}
//# sourceMappingURL=index.js.map
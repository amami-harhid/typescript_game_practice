import { EntityControl } from "./entityControl";

export class Entity {
    private _control: EntityControl;

    constructor() {
        this._control = new EntityControl();
    }

    get Control() {
        return this._control;
    }
}
import { EntityControl, IEntityControl } from "./entityControl";

export class Entity {
    private _control: IEntityControl;

    constructor() {
        this._control = new EntityControl();
    }

    get Control() {
        return this._control;
    }
}
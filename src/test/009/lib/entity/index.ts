import { EntityControl } from "./entityControl";

export class Entity {

    private _entityControl: EntityControl;

    constructor() {
        this._entityControl = new EntityControl();
    }

    get Control() {
        return this._entityControl;
    }
}
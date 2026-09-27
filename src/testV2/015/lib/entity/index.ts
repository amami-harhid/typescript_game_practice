import { EntityControl, IEntityControl } from "./entityControl";
import { Engine, ThreadCaller } from "../engine";
import { FlagPresser, IFlagPresser } from "../engine/flagPresser";
import { Broadcast, IBroadcast } from "../engine/messageRecieved";

export interface IThread {
    /**
     * @needsAsyncGenerator
     */
    set func(f: ThreadCaller);
}

class EntityEvent {
    private _flagPresser: IFlagPresser
    constructor(entity: Entity) {
        this._flagPresser = new FlagPresser(entity);
    }
    get flagPresser() : ()=>IFlagPresser{
        return ()=>this._flagPresser;
    }
}

export class Entity {
    private _control: IEntityControl;
    private _entityEvent: EntityEvent;
    private _broadcast: IBroadcast;
    constructor() {
        this._control = new EntityControl();
        this._entityEvent = new EntityEvent(this);
        this._broadcast = new Broadcast(this);
    }

    get Control() {
        return this._control;
    }
    get Event() {
        return this._entityEvent;
    }
    get Broadcast() {
        return this._broadcast;
    }
    get Thread() : IThread {
        const _me = this;
        return {
            set func(f: ThreadCaller){
                const _f = f.bind(_me);
                Engine.addThread( _f );        
            }
        };
    }
    
}
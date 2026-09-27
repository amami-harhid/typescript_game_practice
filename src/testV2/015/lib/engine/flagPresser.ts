import { Engine, ThreadCaller, type ThreadObj } from ".";
import { Entity } from "../entity";
import { EventIds } from "../event/gameEvent";

export interface IFlagPresser {
    /**
     * @needsAsyncGenerator
     */
    set func(f: ThreadCaller);
}

export class FlagPresser implements IFlagPresser {
    private _entity: Entity;
    private _funcs : ThreadCaller[] = [];
    private _threadArr: ThreadObj[] = [];
    constructor(entity: Entity){
        this._entity = entity;
        Engine.gameEvent.on(EventIds.FLAG_PRESSED, ()=>{
            //console.log('this._funcs length=', this._funcs.length);
            for(const thread of this._threadArr){
                thread.start = true;
            }    
        })
    }
    set func(f: ThreadCaller) {
        this._funcs.push(f);
        const _f = f.bind(this._entity);
        const g = _f();
        const thread : ThreadObj =  {active: true, start: false, g: g, f:_f};
        this._threadArr.push(thread);

        Engine.pushThread(thread);
    }
}


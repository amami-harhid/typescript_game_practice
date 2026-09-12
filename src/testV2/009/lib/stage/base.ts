import { Engine, type ThreadCaller } from "../engine";
import { Entity } from "../entity";

export class StageBase extends Entity{
    get Thread() {
        const _me = this;
        return {
            set func(f: ThreadCaller){
                const _f = f.bind(_me);
                Engine.addThread( _f );        
            }
        };
    }
}
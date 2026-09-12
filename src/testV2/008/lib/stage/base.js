import { Engine } from "../engine";
import { Entity } from "../entity";
export class StageBase extends Entity {
    get Thread() {
        const _me = this;
        return {
            set func(f) {
                const _f = f.bind(_me);
                Engine.addThread(_f);
            }
        };
    }
}
//# sourceMappingURL=base.js.map
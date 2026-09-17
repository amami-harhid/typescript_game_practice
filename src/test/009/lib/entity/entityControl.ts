import { controlWait } from "../../../../lib/controls";

export class EntityControl {
    /**
     * 指定秒数だけ待つ
     * @param sec 
     * @returns 
     * 
     * @needsAwait
     */
    async wait(sec:number) {
        return await controlWait(sec);
    }

}
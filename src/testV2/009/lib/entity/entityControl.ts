import { controlWait } from "../../../../lib/controls";
//import { needsAwait } from "./decorator";
/**
 * @abstract
 * @needsAwait
 */
export class EntityControl {

    /**
     * あいうえお<br>
     * needsAwait
     * @param seconds
     * @needsAwait 
     */
    async wait( seconds: number ): Promise<void> {
        await controlWait(seconds);
    }
}
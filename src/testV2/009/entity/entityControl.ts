import { controlWait } from "../../../lib/controls";
import { needsAwait } from "./decorator";
/**
 * @abstract
 */
export class EntityControl {

    /**
     * あいうえお
     * @param seconds 
     * 
     */
    @needsAwait
    async wait( seconds: number ): Promise<void> {
        await controlWait(seconds);
    }
}
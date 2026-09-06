import { controlWait } from "../../../lib/controls";

/**
 * @abstract
 */
export class EntityControl {

    /**
     * あいうえお
     * @needsAwait
     * @param seconds 
     * 
     */
    async wait( seconds: number ): Promise<void> {
        await controlWait(seconds);
    }
}
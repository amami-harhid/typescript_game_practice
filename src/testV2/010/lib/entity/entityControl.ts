import { controlWait } from "../../../../lib/controls";
/**
 * @abstract
 * @needsAwait
 */
export class EntityControl {

    /**
     * あいうえお
     * @param seconds
     * @needsAwait 
     */
    async wait( seconds: number ): Promise<void> {
        await controlWait(seconds);
    }
}
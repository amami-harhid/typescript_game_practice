import { controlWait } from "../../../../lib/controls";

export interface IEntityControl {
    wait(second: number): Promise<void>;
}

/**
 * @abstract
 * @needsAwait
 */
export class EntityControl implements IEntityControl{

    /**
     * あいうえお
     * @param seconds
     * @needsAwait 
     */
    async wait( seconds: number ): Promise<void> {
        await controlWait(seconds);
    }
}
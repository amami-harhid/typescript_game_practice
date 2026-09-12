import { controlWait } from "../../../../lib/controls";
/**
 * @abstract
 */
export class EntityControl {
    /**
     * @needsAwait
     *
     * あいうえお
     * @param seconds
     *
     */
    async wait(seconds) {
        await controlWait(seconds);
    }
}
//# sourceMappingURL=entityControl.js.map
import { wait } from "../../../lib/controls";

export class Entity {

    get Control() {

        return {
            wait: wait
        }
    }
}
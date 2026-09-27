import { EventEmitter } from "events";

export const EventIds = {
    /** 緑の旗が押されたとき */
    FLAG_PRESSED: 'FLAG_PRESSED',
    /** メッセージ受信のとき */
    MESSAGE_RECIEVED: 'MESSAGE_RECIEVED',
} as const;

export class GameEvent extends EventEmitter {

    constructor() {
        super();
        this.prepareGreenFlagPressed();
    }
    /**
     * 旗が押されたときのイベント受信を準備する
     */
    private prepareGreenFlagPressed() {
        const divGreenFlag = document.querySelector("div.greenFlag") as HTMLDivElement;
        if(divGreenFlag){
            divGreenFlag.addEventListener('click', this.greenFlagPressed.bind(this));
        }else{
            console.log('divGreenFlag not found');
        }
    }
    /**
     * 旗が押されたときのイベントを通知する
     */
    private greenFlagPressed() {
        this.emit(EventIds.FLAG_PRESSED);
    }

}
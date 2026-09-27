import { EventEmitter } from "events";

export const EventIds = {
    /** 緑の旗が押されたとき */
    FLAG_PRESSED: 'FLAG_PRESSED',
} as const;

export class GameEvent extends EventEmitter {
    private _messageArr: string[] = [];
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
    public messageRecieved(message: string) {
        this._messageArr.push(message);
        this.emit( message );
    }
    /**
     * 旗が押されたときのイベントを通知する
     */
    private greenFlagPressed() {
        this.emit(EventIds.FLAG_PRESSED);
    }

}
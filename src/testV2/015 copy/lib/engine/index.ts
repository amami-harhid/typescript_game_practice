/* eslint-disable @typescript-eslint/no-explicit-any */
import '../gui/style.css'; 
import { GameEvent } from '../event/gameEvent';
import { SpriteBase } from "../sprite/base";
import { Stage } from "../stage";


export class Engine {

    private static instance : Engine;
    private static _gameEvent: GameEvent;
    static getInstance(): Engine {
        if(Engine.instance==undefined){
            Engine.instance = new Engine();
        }
        return Engine.instance;
    }
    public static get gameEvent(){
        if(Engine._gameEvent == undefined){
            Engine._gameEvent = new GameEvent();
        }
        return Engine._gameEvent;
    }
    private _sprites: SpriteBase[] = [];

    addSprite(sprite: SpriteBase) {
        this._sprites.push( sprite );
    }

    get sprites() {
        return this._sprites;
    }

    private _stage!: Stage;

    set stage( stage: Stage ) {
        this._stage = stage;
    }

    get stage() {
        return this._stage;
    }

    private _mainCanvas: HTMLCanvasElement;
    private _mainCtx : CanvasRenderingContext2D;
    private _viewWidth: number;
    private _viewHeight: number;
    constructor() {

        // 【本体のキャンバス設定】
        this._mainCanvas = document.querySelector('#canvas') as HTMLCanvasElement;
        this._mainCtx = this._mainCanvas.getContext('2d') as CanvasRenderingContext2D;
        this._viewWidth = window.innerWidth;
        this._viewHeight = window.innerHeight;
        const dpr = window.devicePixelRatio || 1;


        this._mainCanvas.width = this._viewWidth * dpr;
        this._mainCanvas.height = this._viewHeight * dpr;
        this._mainCanvas.style.width = this._viewWidth + 'px';
        this._mainCanvas.style.height = this._viewHeight + 'px';

        
    }
    get mainCanvas() {
        return this._mainCanvas;
    }

    get mainCtx() {
        return this._mainCtx;
    }

    get viewWidth() {
        return this._viewWidth;
    }

    get viewHeight() {
        return this._viewHeight;
    }

    draw() {
        // --- 本体のキャンバスへの描画処理 ---
        this.mainCtx.clearRect(0, 0, this.viewWidth, this.viewHeight);
        if(this._stage){
            this._stage.draw();
        }
        // --- 個別スプライトを個別キャンバスへ描画し、その結果を本体キャンバスへ描画する
        for(const _sprite of this._sprites){
            _sprite.draw();
        }

    }

    private static threads:ThreadCaller[] = []
    public static threadsArr :  {active: boolean, start?: boolean, g: ThreadGenerator}[] = [];
    static generateThread(f: CallableFunction) : ThreadObj {
        const _f = f as unknown as ThreadGeneratorCaller;
        const g = _f();            
        const thread: ThreadObj = {active:true, start:false, f:_f, g: g};
        return thread;
    }
    static pushThread( thread: ThreadObj) {
        Engine.threadsArr.push(thread);
    }
    static addThread( f: ThreadCaller) {
        Engine.threads.push(f);
    }

    static async run() {
        const w = window.innerWidth;
        const h = window.innerHeight;

        const body = document.querySelector('body') as HTMLBodyElement;
        const greenFlagWrapper = document.querySelector('.greenFlagWrapper') as HTMLDialogElement;
        const greenFlag = document.querySelector('#greenFlag') as HTMLDivElement;
        greenFlag.style = `width:${w}px;height:${h}px;`;
        greenFlagWrapper.style = `height:${h}px`;

        const greenFlagSize = (w>h)? h*0.3: w*0.3;
        const divGreenFlag = document.querySelector("div.greenFlag") as HTMLDivElement;
        divGreenFlag.style = `width:${greenFlagSize}px;height:${greenFlagSize}px`;
        
        Engine._innnerRun();
        divGreenFlag.addEventListener('click', function(){
            greenFlag.style = "display: none;"
            body.style = "background-color: #00000000"
        });
    }
    private static async _innnerRun() {
        
        const engine = Engine.getInstance();
        const _loads: Promise<void>[] = [];
        for(const _sprite of engine.sprites){
            _loads.push( _sprite.costume.load() );
        }
        await Promise.all( _loads );
        for( const f of Engine.threads){
            const _f = f as unknown as ThreadGeneratorCaller;
            const g = _f();            
            Engine.threadsArr.push({active:true, g: g});
        }
        const _engine = Engine.getInstance();
        const interval = setInterval( async ()=>{
            for(const thread of Engine.threadsArr){
                if( thread.active === true && thread.start === true){
                    try{
                        thread.g.next().then((rtn)=>{
                            if(rtn.done === true) {
                                // 終了したとき
                                thread.active = false;
                            }
                        })
                    }catch(e){
                        console.log(e);
                        clearInterval(interval);
                        break;
                    }
                }
            }
            _engine.draw();
            let _stopThreads = 0;
            for(const thread of Engine.threadsArr){
                if(thread.active === false){
                    _stopThreads += 1;
                }
            }
            // 停止したスレッド数が全スレッド数のとき
            if( _stopThreads == Engine.threadsArr.length ) {
                // 停止させる
                clearInterval(interval);
            }
            // active でないスレッドは消す
            // Engine.threadsArr = Engine.threadsArr.filter((value)=> value.active === false);

        },  Interval);
    }
}
const Interval = 1000/30;

type Thread = CallableFunction　;
export type ThreadCaller = Thread;
type ThreadGenerator =  AsyncGenerator<unknown, never, unknown>;
type ThreadGeneratorCaller =  ()=>ThreadGenerator;

export type ThreadObj = {active: boolean, start?: boolean, f:Thread ,g: ThreadGenerator, args?: any[]};

/**
 * id: Eventを識別するID , Message送受信の場合は 個別のメッセージIDを含む文字列
 */
export type EventObjMap = Map<string, ThreadObj[]>

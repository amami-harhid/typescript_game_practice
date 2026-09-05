import { SpriteBase } from "../sprite/base";
import { Stage } from "../stage";

export class Engine {

    private static instance : Engine;
    static getInstance(): Engine {
        if(Engine.instance==undefined){
            Engine.instance = new Engine();
        }
        return Engine.instance;
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
    static addThread( f: ThreadCaller) {
        Engine.threads.push(f);
    }
    static async run() {
        const engine = Engine.getInstance();
        const _loads: Promise<void>[] = [];
        for(const _sprite of engine.sprites){
            _loads.push( _sprite.costume.load() );
        }
        await Promise.all( _loads );
        const threads : {active: boolean, g: Thread}[] = [];
        const gList: Thread[] = []
        for( const f of Engine.threads){
            const g = f();
            gList.push(g);
            threads.push({active:true, g: g});
        }
        const _engine = Engine.getInstance();
        let interval = setInterval( async ()=>{
            for(const thread of threads){
                if( thread.active === true){
                    thread.g.next().then((rtn)=>{
                        if(rtn.done === true) {
                            thread.active = false;
                        }
                    })
                }
            }
            let _processExit = false;
            _engine.draw();
            for(const thread of threads){
                if(thread.active === false){
                    _processExit = true;
                    break;
                }
            }
            if( _processExit ) {
                clearInterval(interval);
            }

        },  Interval);
    }
}
const Interval = 1000/30;
type Thread = AsyncGenerator<any, any, unknown>
type ThreadCaller = ()=>Thread;

export class Engine {
    static instance;
    static getInstance() {
        if (Engine.instance == undefined) {
            Engine.instance = new Engine();
        }
        return Engine.instance;
    }
    _sprites = [];
    addSprite(sprite) {
        this._sprites.push(sprite);
    }
    get sprites() {
        return this._sprites;
    }
    _stage;
    set stage(stage) {
        this._stage = stage;
    }
    get stage() {
        return this._stage;
    }
    _mainCanvas;
    _mainCtx;
    _viewWidth;
    _viewHeight;
    constructor() {
        // 【本体のキャンバス設定】
        this._mainCanvas = document.querySelector('#canvas');
        this._mainCtx = this._mainCanvas.getContext('2d');
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
        if (this._stage) {
            this._stage.draw();
        }
        // --- 個別スプライトを個別キャンバスへ描画し、その結果を本体キャンバスへ描画する
        //@ts-loop-yield-skip
        for (const _sprite of this._sprites) {
            _sprite.draw();
        }
    }
    static threads = [];
    static addThread(f) {
        Engine.threads.push(f);
    }
    static async run() {
        const engine = Engine.getInstance();
        const _loads = [];
        //@ts-loop-yield-skip
        for (const _sprite of engine.sprites) {
            _loads.push(_sprite.costume.load());
        }
        await Promise.all(_loads);
        const threads = [];
        //@ts-loop-yield-skip
        for (const f of Engine.threads) {
            const _f = f;
            const g = _f();
            threads.push({ active: true, g: g });
        }
        const _engine = Engine.getInstance();
        const interval = setInterval(async () => {
            //@ts-loop-yield-skip
            for (const thread of threads) {
                if (thread.active === true) {
                    thread.g.next().then((rtn) => {
                        if (rtn.done === true) {
                            thread.active = false;
                        }
                    });
                }
            }
            _engine.draw();
            let _stopThreads = 0;
            //@ts-loop-yield-skip
            for (const thread of threads) {
                if (thread.active === false) {
                    _stopThreads += 1;
                }
            }
            // 停止したスレッド数が全スレッド数のとき
            if (_stopThreads == threads.length) {
                // 停止させる
                clearInterval(interval);
            }
        }, Interval);
    }
}
const Interval = 1000 / 30;
//# sourceMappingURL=index.js.map
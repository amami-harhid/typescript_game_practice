import { Sprite } from "../sprite";
export class Stage {
    private static _sprites: Sprite[] = [];
    public static set sprite(sprite: Sprite) {
        Stage._sprites.push(sprite);
    }
    public static get sprites() {
        return Stage._sprites;
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
    draw() {

        // --- 本体のキャンバスへの描画処理 ---
        // 画面全体を一回真っ白にクリア（他の等倍画像などを残す場合は範囲を調整してください）
        this._mainCtx.clearRect(0, 0, this._viewWidth, this._viewHeight);

        // 【A】の結果を本体の座標 (中心) に中心が来るように描画
        for(const _sprite of Stage._sprites){
            const _position = _sprite.position;
            const targetX = _position.x;
            const targetY = _position.y;
            const _canvas = _sprite.canvas;
            const _size = _sprite.diagonalLineLength;
            this._mainCtx.drawImage(
                _canvas, 
                targetX - _size / 2, 
                targetY - _size / 2, 
                _size, 
                _size
            );

        }
    }
}
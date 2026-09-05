import { Canvas } from "../canvas";
import { Engine } from "../engine";
export class Sprite {
    private _engine: Engine;
    private _scale = {w: 1, h: 1};
    private _degree = 0;
    private _diagonalLineLength = 0;
    private _canvas!: HTMLCanvasElement;
    private _ctx!: CanvasRenderingContext2D;
    private _svgImg!: HTMLImageElement;
    private _svgBaseWidth: number = 0;
    private _svgBaseHeight: number = 0;
    private _position: {x: number, y: number} = {x: 0, y: 0};
    constructor() {
        this._engine = Engine.getInstance();
        this._engine.sprites.push(this);
    }
    set position (_position: {x: number, y: number}) {
        this._position.x = _position.x;
        this._position.y = _position.y;
    }
    get position() {
        return this._position;
    }
    get degree () {
        return this._degree;
    }
    set degree( degree: number) {
        this._degree = degree;
    }
    get scale() {
        return this._scale;
    }
    set scale( _scale:{w: number, h: number} ) {
        this._scale.w = _scale.w;
        this._scale.h = _scale.h;
    }
    private rescale() {

        // 回転してもはみ出さない安全なサイズ（元サイズの対角線の長さ）
        const _size = Math.max(this._svgBaseWidth*Math.abs(this._scale.w), this._svgBaseHeight*Math.abs(this._scale.h));
        this._diagonalLineLength = Math.sqrt( _size**2 + _size**2 ) * Canvas.dpr;
        // 【A】も高解像度対策（dpr倍）されている（ジャギー防止）
        this._canvas.width = this._diagonalLineLength;
        this._canvas.height = this._diagonalLineLength;        
        this._ctx.fillStyle = '#00000000'; // 透明

    }
    setSvgImage( image: string ) {
        this._svgImg = new Image();
        this._svgImg.onload = () => {
            this._svgBaseWidth = this._svgImg.naturalWidth || this._svgImg.width || 100;
            this._svgBaseHeight = this._svgImg.naturalHeight || this._svgImg.height || 100;
            // 1. 専用のオフスクリーンキャンバス【A】を作成
            this._canvas = document.createElement('canvas');
            this._ctx = this._canvas.getContext('2d') as CanvasRenderingContext2D;
            // 回転してもはみ出さない安全なサイズ（元サイズの対角線の長さ）
            const _size = Math.max(this._svgBaseWidth*Math.abs(this._scale.w), this._svgBaseHeight*Math.abs(this._scale.h));
            this._diagonalLineLength = Math.sqrt( _size**2 + _size**2 ) * Canvas.dpr;
            // 【A】も高解像度対策（dpr倍）されている（ジャギー防止）
            this._canvas.width = this._diagonalLineLength;
            this._canvas.height = this._diagonalLineLength;
            this._ctx.fillStyle = '#00000000'; // 透明

        };
        this._svgImg.src = image;
    }
    get canvas() {
        return this._canvas;
    }
    get diagonalLineLength() {
        return this._diagonalLineLength;
    }
    draw() {
        this.rescale();
        this._degree = this._degree % 360;
        // 前のフレームの描画を消去する
        this._ctx.clearRect(0, 0, this._diagonalLineLength, this._diagonalLineLength);
        this._ctx.fillRect(0, 0, this._diagonalLineLength, this._diagonalLineLength);
        this._ctx.save();
        this._ctx.translate(this._diagonalLineLength / 2, this._diagonalLineLength / 2); // 【A】の中心を基準にする
        this._ctx.rotate(this._degree * Math.PI / 180); // 計算した角度で回転
        this._ctx.scale(this._scale.w * Canvas.dpr, this._scale.h * Canvas.dpr);
        // 中心を軸にSVGを描画
        this._ctx.drawImage(this._svgImg, -this._svgBaseWidth / 2, -this._svgBaseHeight / 2, this._svgBaseWidth, this._svgBaseHeight);
        this._ctx.restore();

            const _position = this.position;
            const targetX = _position.x;
            const targetY = _position.y;
            const _canvas = this.canvas;
            const _size = this.diagonalLineLength;
            this._engine.mainCtx.drawImage(
                _canvas, 
                targetX - _size / 2, 
                targetY - _size / 2, 
                _size, 
                _size
            );

    }
}
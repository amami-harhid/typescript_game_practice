import { Loader } from "../../../lib/loader";
import { Canvas } from "../canvas";

export class CostumeImage {

    private _svgPath: string;
    private _image!: HTMLImageElement;
    private _width: number = 0;
    private _height: number = 0;
    private _canvas! : HTMLCanvasElement;
    private _ctx! : CanvasRenderingContext2D;
    private _scale : {w:number, h:number};
    private _diagonalLineLength: number = 0;
    constructor( svgPath: string) {
        this._svgPath = svgPath;
        this._scale = {w: 100, h: 100};
    }
    async load() {
        const svgText = await Loader.loadSvg(this._svgPath);
        this._image = new Image();
        return new Promise<void>(resolve=>{
            this._image.onload = () => {
                // naturalWidth, naturalHeight ～　画像の元の大きさ
                this._width = this._image.naturalWidth || this._image.width || 100;
                this._height = this._image.naturalHeight || this._image.height || 100;
                // 1. 専用のオフスクリーンキャンバス【A】を作成
                this._canvas = document.createElement('canvas');
                this._ctx = this._canvas.getContext('2d') as CanvasRenderingContext2D;
                // 回転してもはみ出さない安全なサイズ（元サイズの対角線の長さ）
                const _size = Math.max(this._width*Math.abs(this._scale.w/100), this._height*Math.abs(this._scale.h/100));
                this._diagonalLineLength = Math.sqrt( _size**2 + _size**2 ) * Canvas.dpr;
                this._canvas.width = this._diagonalLineLength;
                this._canvas.height = this._diagonalLineLength;
                this._ctx.fillStyle = '#00000000'; // 透明
                resolve();
            };
            this._image.src = svgText;
        });
    }
    get width() {
        return this._width;
    }
    get height() {
        return this._height;
    }
    get image() {
        return this._image;
    }
    get diagonalLineLength() {
        return this._diagonalLineLength;
    }
    set diagonalLineLength(diagonalLineLength:number) {
        this._diagonalLineLength = diagonalLineLength;
    }
    get canvas () {
        return this._canvas;
    }
    get ctx() {
        return this._ctx;
    }
    get scale() {
        return this._scale;
    }
}
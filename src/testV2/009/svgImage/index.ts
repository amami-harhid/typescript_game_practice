import { Loader } from "../../../lib/loader";
import { Canvas } from "../canvas";

export class SvgImage {
    private _image!: HTMLImageElement;
    private _svgPath: string;
    private _width: number = 0;
    private _height: number = 0;
    private _canvas! : HTMLCanvasElement;
    private _ctx! : CanvasRenderingContext2D;
    private _scale : {w:number, h:number};
    private _diagonalLineLength: number = 0;
    private _loadCompleted = false;
    constructor( svgPath: string) {
        this._svgPath = svgPath;
        this._scale = {w: 100, h: 100};
    }
    async load() {
        if( this._loadCompleted === true){
            return;
        }
        const svgText = await Loader.loadSvg(this._svgPath);
        await Loader.loadSvgImage(svgText, (_image: HTMLImageElement)=>{
            // naturalWidth, naturalHeight ～　画像の元の大きさ
            this._width = _image.naturalWidth || _image.width || 100;
            this._height = _image.naturalHeight || _image.height || 100;
            // 1. 専用のオフスクリーンキャンバス【A】を作成
            this._canvas = document.createElement('canvas');
            this._ctx = this._canvas.getContext('2d') as CanvasRenderingContext2D;
            // 回転してもはみ出さない安全なサイズ（元サイズの対角線の長さ）
            const _size = Math.max(this._width*Math.abs(this._scale.w/100), this._height*Math.abs(this._scale.h/100));
            this._diagonalLineLength = Math.sqrt( _size**2 + _size**2 ) * Canvas.dpr;
            this._canvas.width = this._diagonalLineLength;
            this._canvas.height = this._diagonalLineLength;
            this._ctx.fillStyle = '#00000000'; // 透明
            this._image = _image;
            this._loadCompleted = true;
        });
    }
    get width() {
        return this._width;
    }
    get height() {
        return this._height;
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
    get image() {
        return this._image;
    }
    get scale() {
        return this._scale;
    }
}
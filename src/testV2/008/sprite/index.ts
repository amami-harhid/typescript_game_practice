import { SpriteBase } from "./base";
export class Sprite extends SpriteBase{
    private _scale = {w: 100, h: 100};
    private _degree = 0;
    private _canvas!: HTMLCanvasElement;
    private _position: {x: number, y: number} = {x: 0, y: 0};
    constructor() {
        super();
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
        const img = this._costume.image
        img.scale.w = _scale.w;
        img.scale.h = _scale.h;
    }
    addImage( image: string ) {
        this._costume.addSvg( image );
    }
    get canvas() {
        return this._canvas;
    }
    get diagonalLineLength() {
        const svgImage = this.costume.image;
        return svgImage.diagonalLineLength;
    }
    draw() {
        const svgImage = this.costume.image;
        if(svgImage.diagonalLineLength == 0 ){
            console.log('diagonalLineLength　がゼロ');
            return;
        }
        this.costume.rescale();

        this.costume.draw();
    }
}
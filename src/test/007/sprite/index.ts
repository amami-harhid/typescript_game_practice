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
        // // 中心を軸にSVGを描画
        // svgImage.ctx.drawImage(svgImage.image, -svgImage.width / 2, -svgImage.height / 2, svgImage.width, svgImage.height);
        // svgImage.ctx.restore();

        // const _position = this.position;
        // const targetX = _position.x;
        // const targetY = _position.y;
        // const _canvas = svgImage.canvas;
        // const _size = svgImage.diagonalLineLength;
        // console.log('this._engine.mainCtx=', this._engine.mainCtx);
        // console.log('[00001]_size=', _size);
        // console.log('_canvas width, height = ', _canvas.width, _canvas.height);
        // this._engine.mainCtx.drawImage(
        //         _canvas, 
        //         targetX - _size / 2, 
        //         targetY - _size / 2, 
        //         _size, 
        //         _size
        // );

    }
}
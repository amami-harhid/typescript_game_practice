import { Sprite } from ".";
import { Canvas } from "../canvas";
import { Engine } from "../engine";
import { SpriteBase } from "./base";
import { CostumeImage } from "./costumeImage";

export class Costume {

    private _images: CostumeImage[] = [];
    private _currentNo = -1;
    private _sprite: Sprite;
    constructor(sprite:SpriteBase) {
        this._sprite = sprite as Sprite;
    }

    addSvg( svgPath : string) {
        const _image = new CostumeImage( svgPath );
        this._images.push( _image );
        this._currentNo = 0; // 最初のイメージが現在の表示画像
    }

    async load() {
        const _loads: Promise<void>[] = [];
        for( const _img of this._images) {
            _loads.push( _img.load() ); // ロードを実行、プロミスをリストへ登録
        }
        // 全てのロードが完了するまで待つ
        await Promise.all( _loads );

    }
    get image() {
        const img = this._images[this._currentNo];
        return img;
    }
    next() {
        if(this._currentNo + 1 < this._images.length) {
            this._currentNo += 1;
        }else{
            this._currentNo = 0;
        }
    }
    rescale() {
        const img = this.image
        // 回転してもはみ出さない安全なサイズ（元サイズの対角線の長さ）
        const _size = Math.max(img.width*Math.abs(this._sprite.scale.w/100), img.height*Math.abs(this._sprite.scale.h/100));
        img.diagonalLineLength = Math.sqrt( _size**2 + _size**2 ) * Canvas.dpr;
        // 【A】も高解像度対策（dpr倍）されている（ジャギー防止）
        img.canvas.width = img.diagonalLineLength;
        img.canvas.height = img.diagonalLineLength;        
        img.ctx.fillStyle = '#00000000'; // 透明

    }
    draw() {
        const svgImage = this._images[this._currentNo];

        this._sprite.degree = this._sprite.degree % 360;
        // 前のフレームの描画を消去する
        svgImage.ctx.clearRect(0, 0, svgImage.diagonalLineLength, svgImage.diagonalLineLength);
        svgImage.ctx.fillRect(0, 0, svgImage.diagonalLineLength, svgImage.diagonalLineLength);
        svgImage.ctx.save();
        svgImage.ctx.translate(svgImage.diagonalLineLength / 2, svgImage.diagonalLineLength / 2); // 【A】の中心を基準にする
        svgImage.ctx.rotate(this._sprite.degree * Math.PI / 180); // 計算した角度で回転
        svgImage.ctx.scale(this._sprite.scale.w/100 * Canvas.dpr, this._sprite.scale.h/100 * Canvas.dpr);

        // 中心を軸にSVGを描画
        svgImage.ctx.drawImage(svgImage.image, -svgImage.width / 2, -svgImage.height / 2, svgImage.width, svgImage.height);
        svgImage.ctx.restore();

        const _engine = Engine.getInstance();
        const _position = this._sprite.position;
        const targetX = _position.x;
        const targetY = _position.y;
        const _canvas = svgImage.canvas;
        const _size = svgImage.diagonalLineLength;
        _engine.mainCtx.drawImage(
                _canvas, 
                targetX - _size / 2, 
                targetY - _size / 2, 
                _size, 
                _size
        );

    }
}
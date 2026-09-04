import { Loader } from '../../lib/loader';

import Apple from '../../../assets/Apple.svg';

// Canvas 
const canvas = document.querySelector('#canvas') as HTMLCanvasElement;

const svgText = await Loader.loadSvg(Apple);

const Width = window.innerWidth / 2;
const Height = window.innerHeight / 2;
// 画面上に表示したいサイズ（CSSサイズ）
const displayWidth = Width;
const displayHeight = Height;
//canvas.style.width = '100%';
//canvas.style.height = `${Height}px`;
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;
console.log('window.devicePixelRatio=',window.devicePixelRatio, ',dpr=',dpr)
// 1. Canvasの「内部解像度」を倍にする
canvas.width = displayWidth * dpr;
canvas.height = displayHeight * dpr;
// 2. Canvasの「表示サイズ（CSS）」は元のサイズに固定する
canvas.style.width = displayWidth + 'px';
canvas.style.height = displayHeight + 'px';

if(ctx){
    // 3. 描画コンテキスト全体をあらかじめ拡大しておく
    ctx.scale(dpr, dpr);
    ctx.save(); // 現在の状態（等倍）を保存
    //ctx.clearRect(0, 0, Width, Height);
    const img = new Image();
    img.onload = () => {
        const scale = {w: 3, h: -3};
        const angle = 45 * Math.PI / 180;
        ctx.translate(displayWidth/4, displayHeight/4);
        ctx.rotate(angle);
        //ctx.translate(150, 50);
        ctx.scale(scale.w, scale.h);
        const bounds = {width: img.width, height: img.height}
        console.log(bounds)
        ctx.fillStyle = '#f0f020'; // 例：薄いグレー
        ctx.fillRect(0, 0, canvas.width/scale.w, canvas.height/scale.h);
        ctx.drawImage(img, (displayWidth/2 )/scale.w- bounds.width/2, (displayHeight/2 )/scale.h- bounds.height / 2);
//        ctx.drawImage(img, 10, 10);
//        ctx.restore(); // 2倍の状態をリセットして元の等倍に戻す
        URL.revokeObjectURL(svgText);
    }
    img.src = svgText;
}

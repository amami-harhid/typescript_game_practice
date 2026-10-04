/**
 * ゲームライブラリを作ろう
 * 
 * CANVASへ線を引く
 * 
 */

// CANVASを取り込む

const canvas = document.querySelector('#my_canvas') as HTMLCanvasElement;

console.log("CANVAS=", canvas);

// CanvasRenderingContext2D
// 2D として宣言した CanvasRenderingContext2D へ描画する

const ctx = canvas.getContext('2d');

console.log("CanvasRenderingContext2D=", ctx);

// ウインドウのサイズを取り出す
const Width = window.innerWidth / 2;
const Height = window.innerHeight / 2;
// 画面上に表示したいサイズ（CSSサイズ）
const displayWidth = Width;
const displayHeight = Height;

// デバイスピクセル比
// （CSS ピクセルの解像度と物理ピクセルの解像度の比）
const dpr = window.devicePixelRatio || 1;
console.log('window.devicePixelRatio=',window.devicePixelRatio, ',dpr=',dpr)
// 1. Canvasの「内部解像度」を倍にする
canvas.width = displayWidth * dpr * 2;
canvas.height = displayHeight * dpr * 2;
// 2. Canvasの「表示サイズ（CSS）」は元のサイズに固定する
canvas.style.width = displayWidth + 'px';
canvas.style.height = displayHeight + 'px';

if(ctx) {
    const start = {x:30, y:50};
    const end = {x:150, y:100};
    //drawLine(ctx, {x:30, y:50}, {x:150, y:100})
    setTimeout(drawLine, 1000, ctx, start, end);
}

function drawLine(ctx: CanvasRenderingContext2D ,start:{x:number,y:number}, end:{x:number,y:number}) {
    ctx.beginPath();        // パス開始
    ctx.moveTo(start.x, start.y);     // 始点
    ctx.lineTo(end.x, end.y);   // 終点へ線を引く
    ctx.stroke();           // 描画
}
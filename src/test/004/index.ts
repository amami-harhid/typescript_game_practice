/**
 * オフスクリーン方式を試行する
 * ( スプライトを回転させる )
 * 
 */

import { Loader } from '../../lib/loader';

import Cat from '../../../assets/cat.svg';
const svgText = await Loader.loadSvg(Cat);

// 【本体のキャンバス設定】
const mainCanvas = document.querySelector('#canvas') as HTMLCanvasElement;
const mainCtx = mainCanvas.getContext('2d') as CanvasRenderingContext2D;
const viewWidth = window.innerWidth;
const viewHeight = window.innerHeight;
const dpr = window.devicePixelRatio || 1;


mainCanvas.width = viewWidth * dpr;
mainCanvas.height = viewHeight * dpr;
mainCanvas.style.width = viewWidth + 'px';
mainCanvas.style.height = viewHeight + 'px';
//mainCtx.scale(dpr, dpr); // 本体のベース高解像度化
console.log('dpr=',dpr)
// --- 画像の読み込みとアニメーション設定 ---
const svgImg = new Image();

// 現在の回転角度（度数法：0〜360度）
let currentDegree = 0;

svgImg.onload = () => {
    // 安全に画像の元サイズを取得（ダメなら100をデフォルトに）
    const svgBaseWidth = svgImg.naturalWidth || svgImg.width || 100;
    const svgBaseHeight = svgImg.naturalHeight || svgImg.height || 100;
    console.log('svgBaseWidth=', svgBaseWidth, ', svgBaseHeight=',svgBaseHeight)
    // 1. 専用のオフスクリーンキャンバス【A】を作成
    const canvasA = document.createElement('canvas');
    const ctxA = canvasA.getContext('2d') as CanvasRenderingContext2D;

    const scale = {w: 1, h: 1};

    // 回転してもはみ出さない安全なサイズ（元サイズの対角線の長さ）
    const _size = Math.max(svgBaseWidth*Math.abs(scale.w), svgBaseHeight*Math.abs(scale.h));
    console.log('_size=', _size);
    const sizeA = Math.sqrt( _size**2 + _size**2 ) * dpr; 
    console.log('sizeA=', sizeA);
    // 【A】も高解像度対策（dpr倍）されている（ジャギー防止）
    canvasA.width = sizeA;
    canvasA.height = sizeA;
    ctxA.fillStyle = '#f0f020'; // 例：薄いグレー
    //ctxA.scale(scale.w, scale.h);
    // 2. setInterval でアニメーションループを開始（約60fps ≒ 16ms間隔）
    setInterval(() => {
        // 角度を更新（毎フレーム 2度ずつ右回転）
        currentDegree = (currentDegree + 5) % 360;

        // --- 【A】への描画処理 ---
        // 前のフレームの描画を消去する
        ctxA.clearRect(0, 0, sizeA, sizeA);
        ctxA.fillRect(0, 0, sizeA, sizeA);
    
        ctxA.save();
        ctxA.translate(sizeA / 2, sizeA / 2); // 【A】の中心を基準にする
        ctxA.rotate(currentDegree * Math.PI / 180); // 計算した角度で回転
        ctxA.scale(scale.w * dpr, scale.h * dpr);                   // 左右反転 ＆ 2倍拡大
    
        // 中心を軸にSVGを描画
        ctxA.drawImage(svgImg, -svgBaseWidth / 2, -svgBaseHeight / 2, svgBaseWidth, svgBaseHeight);
        ctxA.restore();


        // --- 本体のキャンバスへの描画処理 ---
        // 画面全体を一回真っ白にクリア（他の等倍画像などを残す場合は範囲を調整してください）
        mainCtx.clearRect(0, 0, viewWidth, viewHeight);

        // 【A】の結果を本体の座標 (中心) に中心が来るように描画
        const targetX = mainCanvas.width/2;
        const targetY = mainCanvas.height/2;

        mainCtx.drawImage(
            canvasA, 
            targetX - sizeA / 2, 
            targetY - sizeA / 2, 
            sizeA, 
            sizeA
        );

    // （参考）もし2個目の「動かない等倍イメージ」もあるなら、ここで一緒に再描画します
    // mainCtx.drawImage(svgImg2, 350, 50, width, height);

  }, 1000/30); // 約30fps
};

svgImg.src = svgText;
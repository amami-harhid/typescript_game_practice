export class Canvas {
    static get mainCanvas() {
        const canvas = document.querySelector('#canvas') as HTMLCanvasElement;
        return canvas;
    }
    static get mainCtx() {
        return Canvas.mainCanvas.getContext('2d') as CanvasRenderingContext2D;
    }
    static get dpr() {
        const dpr = window.devicePixelRatio || 1;
        return dpr;
    }
}
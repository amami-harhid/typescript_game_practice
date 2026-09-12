export class Canvas {
    static get mainCanvas() {
        const canvas = document.querySelector('#canvas');
        return canvas;
    }
    static get mainCtx() {
        return Canvas.mainCanvas.getContext('2d');
    }
    static get dpr() {
        const dpr = window.devicePixelRatio || 1;
        return dpr;
    }
}
//# sourceMappingURL=index.js.map
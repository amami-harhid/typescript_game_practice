export class Loader {
    static async loadSvg(path) {
        const response = await fetch(path);
        const blob = await response.blob();
        const reader = new FileReader();
        return new Promise((resolve) => {
            reader.onloadend = () => {
                const base64 = reader.result;
                resolve(base64);
            };
            reader.readAsDataURL(blob);
        });
    }
    static async loadSvgImage(svg, callback) {
        const _image = new Image();
        return new Promise(resolve => {
            _image.onload = () => {
                callback(_image);
                resolve();
            };
            _image.src = svg;
        });
    }
}
//# sourceMappingURL=index.js.map
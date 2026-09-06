export class Loader {

    static async loadSvg(path: string) {

        const response = await fetch(path);
        const blob = await response.blob();
        const reader = new FileReader();
        return new Promise<string>((resolve)=>{
            reader.onloadend = () => {
                const base64 = reader.result;
                resolve(base64 as string);
            }
            reader.readAsDataURL(blob);
        })
    }

    static async loadSvgImage(svg: string, callback: CallableFunction) {

        const _image = new Image();
        return new Promise<void>(resolve=>{
            _image.onload = () => {
                callback(_image);
                resolve();
            };
            _image.src = svg;
        });
        
    }

}
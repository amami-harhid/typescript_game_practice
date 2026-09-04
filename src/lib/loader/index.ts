export class Loader {

    static async loadSvg(path: string) {

        const response = await fetch(path);
        const blob = await response.blob();
        // text: Response ストリームを取得して完全に読み込みます。
        const text = await blob.text();
        //console.log(text)
        const reader = new FileReader();
        return new Promise<string>((resolve)=>{
            reader.onloadend = () => {
                const base64 = reader.result;
                resolve(base64 as string);
            }
            reader.readAsDataURL(blob);
        })
    }

}
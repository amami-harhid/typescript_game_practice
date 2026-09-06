/**
 * 待つ
 * @param seconds 
 * @returns 
 */
export const controlWait = async (seconds: number)=>{
    return new Promise<void>(resolve=>{
        setTimeout(()=>{
            resolve();
        }, seconds*1000);
    })
}
/**
 * 待つ
 * @param seconds
 * @returns
 */
export const controlWait = async (seconds) => {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, seconds * 1000);
    });
};
//# sourceMappingURL=index.js.map
/* eslint-disable @typescript-eslint/no-explicit-any */
// 最新仕様（Stage 3）のメソッドデコレータ定義
export function needsAwait(originalMethod: any, context: ClassMethodDecoratorContext) {
    // 中身は空でOKです
    console.log('originalMethod=', originalMethod);
    console.log('context=', context);
}
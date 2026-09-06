/**
 * await の付与対象となるメソッドのパターン辞書
 * キーはメソッドのフルパス（オブジェクト名を除く部分）
 */
export const AWAIT_TARGET_METHODS = new Set([
    // 'Looks.backdrop.nextAndWait',
    // 'Looks.backdrop.previousAndWait',
    // 'Looks.backdrop.switchRandomAndWait',
    // 'Looks.backdrop.switchAndWait',
    'wait',
    // 'Control.waitUntil',
    // 'Control.waitWhile',
    // 'Broadcast.sendAndWait',
    // 'Looks.bubble.sayForSecs',
    // 'Looks.bubble.thinkForSecs',
    // 'Motion.move.glideTo',
    // 'Motion.move.glideToRandom',
    // 'Motion.move.glideToMouse',
    // 'Sensing.askAndWait',
    // 'Sound.playUntilDone',
    // 'Speech.speech',
]);
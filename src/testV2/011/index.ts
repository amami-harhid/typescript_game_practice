import { Sprite } from './lib/sprite';
import { threadObj, test, Tester, test_2 } from './sub/threads';

const tester = new Tester();

const obj = {
    thread: threadObj.thread4,
    threadTest: test,
    theradMethod: tester.thread,
    threadStatic: Tester.threadS,
    test: test_2,
    testUndefined: undefined,
} as const;
console.log(obj);

//const test2 = test;//obj.threadTest;

const sprite = new Sprite();

const b = obj.test;

const a = b

sprite.Thread.func = a
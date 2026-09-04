import { Test } from '../../lib/test';

const images = new Test();

const word = images.test();

const body = document.getElementsByTagName('body') as HTMLCollection;

console.log(body)

const element = document.createElement('span') as HTMLSpanElement;

body[0].appendChild(element);

element.innerText = word;
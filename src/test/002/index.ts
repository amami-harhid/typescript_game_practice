import { Loader } from '../../lib/loader';

import Apple from '../../../assets/Apple.svg';

const text = await Loader.loadSvg(Apple);

console.log(text);

const body = document.getElementsByTagName('body') as HTMLCollection;

console.log(body)

const element = document.createElement('span') as HTMLSpanElement;

body[0].appendChild(element);

element.innerText = text;


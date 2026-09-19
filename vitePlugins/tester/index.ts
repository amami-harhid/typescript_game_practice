import type { Plugin } from 'vite';
import { transform } from './transformer.ts';

export function vitePluginAutoAwait(): Plugin {

    return {
        name: 'vite-plugin-testTracer',
        
        transform(code, id) {

            //console.log('id=',id);        
            
            if(id.includes('virtual:') || id.includes('/node_modules/')) return null;

            transform(code, id);

            return {
				code: code, 
				map: null,
			}
        }
    }

}
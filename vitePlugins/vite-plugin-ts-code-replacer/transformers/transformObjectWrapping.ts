
import ts from 'typescript';

export function transformObjectWrapping(code: string, id: string, typeChecker: ts.TypeChecker): { code: string; map: any } {
    
	if (!id.endsWith('.ts') && !id.endsWith('.tsx') || id.includes('node_modules')) return { code, map: null };



	    return { code, map: null };

	


}


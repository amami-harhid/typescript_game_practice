import * as Helper from '../../helper.ts';

export class AsyncGeneratorError extends Error {
    
    private _errorObj: Helper.ErrorObj;

    constructor(errorObj: Helper.ErrorObj){

        super();

        this._errorObj = errorObj;
    }

    get errorObj() {
        return this._errorObj;
    }

}
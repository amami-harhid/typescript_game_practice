/* eslint-disable @typescript-eslint/no-explicit-any */

import { Engine, EventObjMap, ThreadCaller, type ThreadObj } from ".";
import { Entity } from "../entity";
import { EventIds } from "../event/gameEvent";

export interface IMessageReciever {
    /**
     * @needsAsyncGenerator
     */
    set func(f: ThreadCaller);
}
export interface IBroadcast {

    receiver( messageId: string): IMessageReciever;

    /**
     * メッセージを送信する
     * @param messageId 
     * @param args
     */
    send(messageId: string, ...args: any[]): void;
}
export class Broadcast implements IBroadcast{
    private _reciever: IMessageReciever;
    
    constructor(entity: Entity) {
        this._reciever = new MessageReciever(entity);
    }
    
    receiver( messageId: string ) {
        (this._reciever as MessageReciever).messageId = messageId; 
        return this._reciever
    }

    send(messageId: string, ...args: any[]) {
        if(MessageReciever.MessageIdArr.filter(value => value == messageId).length >0 ){
            const _messageId = EventIds.MESSAGE_RECIEVED + '.' + messageId;
            Engine.gameEvent.emit(_messageId, ...args);
        }
    }
}
export class MessageReciever implements IMessageReciever {
    static MessageIdArr: string[] = [];
    static threadsObjMap : EventObjMap = new Map<string, ThreadObj[]>();
    static threadsArr : ThreadObj[] = [];
    private _messageId: string = '';
    private _entity: Entity;
    private _funcs : ThreadCaller[] = [];
    //private _threadArr: ThreadObj[] = [];
    constructor(entity: Entity){
        this._entity = entity;
    }
    set messageId( messageId: string) {
        const found = MessageReciever.MessageIdArr.filter(value => value == messageId).length;
        if(found == 0) {
            this._messageId = messageId;
            MessageReciever.MessageIdArr.push(messageId);
            const _messageId = EventIds.MESSAGE_RECIEVED + '.' + this._messageId;
            Engine.gameEvent.on( _messageId, (...args:any[])=>{
                console.log('_messageId= ', _messageId)
                const threadArr = MessageReciever.threadsObjMap.get(_messageId);
                if(threadArr){
                    for(const thread of threadArr){
                        thread.g = thread.f(...args);
                        thread.args = args;
                        thread.active = true;
                        thread.start = true; // 開始！
                    }
                }
            });
        }
    }
    set func(f: ThreadCaller) {
        this._funcs.push(f);
        const _f = f.bind(this._entity);
        const g = _f();
        const _messageId = EventIds.MESSAGE_RECIEVED + '.' + this._messageId;
        const thread : ThreadObj =  {active: false, start: false, g: g, f:_f};
        Engine.pushThread(thread);
        const threadArr = MessageReciever.threadsObjMap.get(_messageId);
        if(threadArr){
            threadArr.push(thread);
        }else{
            MessageReciever.threadsObjMap.set(_messageId, [thread]);
        }
    }
}


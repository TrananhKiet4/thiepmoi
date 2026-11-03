import {MemoryStore} from 'express-rate-limit';

export class BoundedMemoryStore extends MemoryStore{
 constructor(private maxKeys=10000){super();}
 override async increment(key:string){
  if(!this.current.has(key)&&!this.previous.has(key)&&this.current.size+this.previous.size>=this.maxKeys)return {totalHits:Number.MAX_SAFE_INTEGER,resetTime:new Date(Date.now()+this.windowMs)};
  return super.increment(key);
 }
}

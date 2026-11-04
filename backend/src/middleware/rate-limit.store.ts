import {MemoryStore,type Store,type Options} from 'express-rate-limit';
import {createHash} from 'node:crypto';
import {prisma} from '../config/database.js';
import {config} from '../config/env.js';

export class BoundedMemoryStore extends MemoryStore{
 constructor(private maxKeys=10000){super();}
 override async increment(key:string){
  if(!this.current.has(key)&&!this.previous.has(key)&&this.current.size+this.previous.size>=this.maxKeys)return {totalHits:Number.MAX_SAFE_INTEGER,resetTime:new Date(Date.now()+this.windowMs)};
  return super.increment(key);
 }
}
export class PostgresRateLimitStore implements Store{
 localKeys=false;private windowMs=60000;
 constructor(private namespace:string){}
 init(options:Options){this.windowMs=options.windowMs;}
 private key(key:string){return this.namespace+':'+createHash('sha256').update(key).digest('hex');}
 async increment(key:string){
  const rows=await prisma.$queryRaw<{hits:number;expiresAt:Date}[]>`
   INSERT INTO "RateLimitBucket" ("key","hits","expiresAt") VALUES (${this.key(key)},1,clock_timestamp()+${this.windowMs}::double precision*interval '1 millisecond')
   ON CONFLICT ("key") DO UPDATE SET
    "hits"=CASE WHEN "RateLimitBucket"."expiresAt"<=clock_timestamp() THEN 1 ELSE LEAST("RateLimitBucket"."hits"+1,2147483646) END,
    "expiresAt"=CASE WHEN "RateLimitBucket"."expiresAt"<=clock_timestamp() THEN clock_timestamp()+${this.windowMs}::double precision*interval '1 millisecond' ELSE "RateLimitBucket"."expiresAt" END
   RETURNING "hits","expiresAt"`;
  return {totalHits:rows[0].hits,resetTime:rows[0].expiresAt};
 }
 async decrement(key:string){try{await prisma.$executeRaw`UPDATE "RateLimitBucket" SET "hits"=GREATEST("hits"-1,0) WHERE "key"=${this.key(key)} AND "expiresAt">clock_timestamp()`;}catch{console.error(JSON.stringify({code:'RATE_LIMIT_DECREMENT_FAILED'}));}}
 async resetKey(key:string){await prisma.rateLimitBucket.deleteMany({where:{key:this.key(key)}});}
}
export const rateLimitStore=(namespace:string)=>config.production?new PostgresRateLimitStore(namespace):new BoundedMemoryStore();

import {afterEach,expect,it} from 'vitest';
import * as stores from '../src/middleware/rate-limit.store.js';
import {prisma} from '../src/config/database.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

afterEach(async()=>{if((prisma as any).rateLimitBucket)await (prisma as any).rateLimitBucket.deleteMany({where:{key:{startsWith:'test-'}}});});
it('shares atomic counters across instances, isolates namespaces and resets expired buckets',async()=>{
 const Store=(stores as any).PostgresRateLimitStore;
 expect(typeof Store).toBe('function');
 const a=new Store('test-a'),b=new Store('test-a'),other=new Store('test-b');
 for(const store of [a,b,other])store.init({windowMs:60000});
 const results=await Promise.all(Array.from({length:20},(_,i)=>(i%2?a:b).increment('private-identity')));
 expect(results.map(r=>r.totalHits).sort((a,b)=>a-b)).toEqual(Array.from({length:20},(_,i)=>i+1));
 expect((await other.increment('private-identity')).totalHits).toBe(1);
 await b.decrement('private-identity');expect((await a.increment('private-identity')).totalHits).toBe(20);
 await (prisma as any).rateLimitBucket.updateMany({where:{key:{startsWith:'test-a:'}},data:{expiresAt:new Date(0)}});
 expect((await b.increment('private-identity')).totalHits).toBe(1);
 await a.resetKey('private-identity');await a.decrement('private-identity');expect((await b.increment('private-identity')).totalHits).toBe(1);
 const rows=await (prisma as any).rateLimitBucket.findMany({where:{key:{startsWith:'test-'}}});
 expect(rows.every((row:any)=>!row.key.includes('private-identity'))).toBe(true);
});
it('keeps a successful response and its counted hit when the asynchronous decrement database call fails',async()=>{
 const code=`import express from 'express';import request from 'supertest';import {rateLimit} from 'express-rate-limit';import {PostgresRateLimitStore} from './backend/src/middleware/rate-limit.store.ts';import {prisma} from './backend/src/config/database.ts';
 prisma.$executeRaw=async()=>{throw new Error('synthetic database outage')};
 const app=express();app.use(rateLimit({store:new PostgresRateLimitStore('test-decrement'),windowMs:60000,limit:5,skipSuccessfulRequests:true}));app.get('/',(_,res)=>res.send('ok'));
 const response=await request(app).get('/');if(response.status!==200)process.exitCode=2;await new Promise(r=>setTimeout(r,100));await prisma.$disconnect();`;
 const result=await promisify(execFile)(process.execPath,['--env-file=.env.test','--import','tsx','--input-type=module','-e',code],{windowsHide:true,timeout:15000}).then(r=>({code:0,stderr:r.stderr}),()=>({code:1,stderr:''}));
 expect(result.code).toBe(0);expect(result.stderr).toContain('RATE_LIMIT_DECREMENT_FAILED');
 expect((await prisma.rateLimitBucket.findFirstOrThrow({where:{key:{startsWith:'test-decrement:'}}})).hits).toBe(1);
});

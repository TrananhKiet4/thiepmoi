import {afterEach,expect,it} from 'vitest';
import * as stores from '../src/middleware/rate-limit.store.js';
import {prisma} from '../src/config/database.js';

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

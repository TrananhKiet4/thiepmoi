import {it,expect} from 'vitest';
import {BoundedMemoryStore} from '../src/middleware/rate-limit.store.js';

it('denies new clients at capacity while preserving counters for existing clients',async()=>{
 const s=new BoundedMemoryStore(2);s.windowMs=60000;
 expect((await s.increment('a')).totalHits).toBe(1);expect((await s.increment('b')).totalHits).toBe(1);
 expect((await s.increment('c')).totalHits).toBeGreaterThan(1000);
 expect(await s.get('c')).toBeUndefined();expect((await s.increment('a')).totalHits).toBe(2);
});

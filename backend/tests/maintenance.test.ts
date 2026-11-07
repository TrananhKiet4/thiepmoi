import {beforeEach,afterEach,expect,it} from 'vitest';
import request from 'supertest';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {config} from '../src/config/env.js';
import {prisma} from '../src/config/database.js';
import {createApp} from '../src/app.js';
import {setupTestData,resetTestDatabase} from './helpers.js';

const app=createApp(),oldSecret=process.env.CRON_SECRET;let f:Awaited<ReturnType<typeof setupTestData>>;
beforeEach(async()=>{await resetTestDatabase();f=await setupTestData();});
afterEach(()=>{if(oldSecret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=oldSecret;});
it('requires a configured cron secret and rejects missing, wrong and multibyte credentials',async()=>{
 delete process.env.CRON_SECRET;expect((await request(app).get('/api/maintenance')).status).toBe(503);
 process.env.CRON_SECRET='s'.repeat(40);
 expect((await request(app).get('/api/maintenance')).status).toBe(401);
 expect((await request(app).get('/api/maintenance').set('Authorization','Bearer '+'é'.repeat(40))).status).toBe(401);
 expect((await request(app).get('/api/maintenance').set('Authorization','Bearer '+'s'.repeat(40))).status).toBe(200);
});
it('deletes expired temporary objects, retains failed deletions and leaves live uploads and real assets alone',async()=>{
 process.env.CRON_SECRET='s'.repeat(40);
 const expired=new Date(Date.now()-120000),live=new Date(Date.now()+600000);
 async function row(key:string,expiresAt:Date){return prisma.temporaryObject.create({data:{adminId:f.admin.id,eventId:f.event.id,purpose:'MEDIA',storageKey:key,originalName:'photo.jpg',bytes:3,uploadExpiresAt:expiresAt,expiresAt}});}
 const key=`${f.event.id}/${randomUUID()}/source.bin`,path=join(config.storageRoot,'private',key);await mkdir(dirname(path),{recursive:true});await writeFile(path,'raw');
 const stale=await row(key,expired),failed=await row('invalid-key',expired),active=await row(`${f.event.id}/${randomUUID()}/source.bin`,live);
 const response=await request(app).get('/api/maintenance').set('Authorization','Bearer '+'s'.repeat(40));
 expect(response.status).toBe(200);expect(response.body.data.temporaryObjects).toEqual({deleted:1,failed:1});
 expect(await prisma.temporaryObject.findUnique({where:{id:stale.id}})).toBeNull();
 expect(await prisma.temporaryObject.count({where:{id:{in:[failed.id,active.id]}}})).toBe(2);
});
it('limits each database cleanup batch instead of deleting an entire backlog',async()=>{
 process.env.CRON_SECRET='s'.repeat(40);
 await prisma.adminSession.createMany({data:Array.from({length:1005},()=>({adminId:f.admin.id,sessionHash:randomUUID(),csrfToken:'unused',expiresAt:new Date(0)}))});
 const response=await request(app).get('/api/maintenance').set('Authorization','Bearer '+'s'.repeat(40));
 expect(response.status).toBe(200);expect(response.body.data.sessions).toBe(1000);
 expect(await prisma.adminSession.count({where:{expiresAt:{lt:new Date()}}})).toBe(5);
});
it('does not delete a counter renewed by another transaction during cleanup',async()=>{
 process.env.CRON_SECRET='s'.repeat(40);const key='renewal-race';
 await prisma.rateLimitBucket.create({data:{key,hits:5,expiresAt:new Date(0)}});
 await prisma.rateLimitBucket.createMany({data:Array.from({length:2000},(_,i)=>({key:'backlog-'+i,hits:1,expiresAt:new Date(1000)}))});
 await prisma.$executeRawUnsafe('ANALYZE "RateLimitBucket"');
 let notify!:()=>void,release!:()=>void;const locked=new Promise<void>(r=>notify=r),hold=new Promise<void>(r=>release=r);
 const renewal=prisma.$transaction(async tx=>{await tx.rateLimitBucket.update({where:{key},data:{hits:1,expiresAt:new Date(Date.now()+60000)}});notify();await hold;});
 await locked;const timer=setTimeout(release,500);
 try{
  const response=await request(app).get('/api/maintenance').set('Authorization','Bearer '+'s'.repeat(40));
  expect(response.status).toBe(200);
 }finally{release();clearTimeout(timer);await renewal;}
 expect((await prisma.rateLimitBucket.findUnique({where:{key}}))?.hits).toBe(1);
});

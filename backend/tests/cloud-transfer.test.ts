import {beforeEach,expect,it} from 'vitest';
import request from 'supertest';
import {createApp} from '../src/app.js';
import {resetTestDatabase,setupTestData} from './helpers.js';
import {prisma} from '../src/config/database.js';
import {config} from '../src/config/env.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import ExcelJS from 'exceljs';

const app=createApp();let f:Awaited<ReturnType<typeof setupTestData>>;
beforeEach(async()=>{await resetTestDatabase();f=await setupTestData();});
const admin=(path:string,body:unknown)=>request(app).post('/api/v1/admin/'+path).set('Cookie',f.cookie).set('Origin','http://localhost:5173').set('X-CSRF-Token',f.csrf).set('Idempotency-Key',randomUUID()).send(body);
async function staged(bytes:Buffer,purpose='IMPORT',name='guests.xlsx'){
 const id=randomUUID(),storageKey=`${f.event.id}/${id}/source.bin`,path=join(config.storageRoot,'private',storageKey);
 await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);
 return prisma.temporaryObject.create({data:{id,adminId:f.admin.id,eventId:f.event.id,purpose,storageKey,originalName:name,bytes:bytes.length,uploadExpiresAt:new Date(Date.now()+300000),expiresAt:new Date(Date.now()+1800000)}});
}
it('offers local multipart only after validating upload ownership and limits',async()=>{
 const send=(id:string,body:unknown)=>request(app).post(`/api/v1/admin/events/${id}/uploads`).set('Cookie',f.cookie).set('Origin','http://localhost:5173').set('X-CSRF-Token',f.csrf).send(body);
 expect((await send(f.event.id,{purpose:'IMPORT',name:'guests.xlsx',bytes:5*1024*1024})).body.data).toEqual({mode:'multipart'});
 expect((await send(f.event.id,{purpose:'MEDIA',name:'photo.jpg',bytes:100})).status).toBe(400);
 expect((await send(f.event.id,{purpose:'IMPORT',name:'guests.xlsx',bytes:5*1024*1024+1})).status).toBe(400);
 expect((await send(f.event.id,{purpose:'IMPORT',name:'photo.svg',bytes:100})).status).toBe(400);
 expect((await send('00000000-0000-4000-8000-000000000001',{purpose:'IMPORT',name:'guests.xlsx',bytes:100})).status).toBe(404);
 expect((await request(app).post(`/api/v1/admin/events/${f.event.id}/uploads`).set('Origin','http://localhost:5173').send({})).status).toBe(401);
});
it('rejects foreign, expired, wrong-purpose and oversized source objects before using them',async()=>{
 const inspect=(uploadId:string)=>admin(`events/${f.event.id}/imports/inspect`,{uploadId});
 const upload=await staged(Buffer.from('fake'));
 await prisma.temporaryObject.update({where:{id:upload.id},data:{expiresAt:new Date(0)}});
 expect((await inspect(upload.id)).status).toBe(409);
 const wrong=await staged(Buffer.from('fake'),'MEDIA','photo.jpg');
 expect((await inspect(wrong.id)).status).toBe(404);
 const other=await prisma.adminUser.create({data:{email:'other@example.test',passwordHash:'unused'}});
 const foreign=await staged(Buffer.from('fake'));
 await prisma.temporaryObject.update({where:{id:foreign.id},data:{adminId:other.id}});
 expect((await inspect(foreign.id)).status).toBe(404);
 expect((await prisma.temporaryObject.findUniqueOrThrow({where:{id:foreign.id}})).claimedAt).toBeNull();
 const oversize=await staged(Buffer.alloc(5*1024*1024+1));
 expect((await inspect(oversize.id)).status).toBe(413);
});
it('inspects an XLSX without consuming it, then previews it once using the same uploadId',async()=>{
 const book=new ExcelJS.Workbook();book.addWorksheet('Guests').addRows([['code','name'],['NEW001','A guest']]);
 const upload=await staged(Buffer.from(await book.xlsx.writeBuffer()),'IMPORT','guests.xlsx');
 expect((await admin(`events/${f.event.id}/imports/inspect`,{uploadId:upload.id})).status).toBe(200);
 expect((await prisma.temporaryObject.findUniqueOrThrow({where:{id:upload.id}})).claimedAt).toBeNull();
 const body={uploadId:upload.id,sheet:'Guests',mapping:{guest_code:'code',full_name:'name'}};
 const preview=await admin(`events/${f.event.id}/imports/preview`,body);expect(preview.status).toBe(201);expect(preview.body.data.summary.created).toBe(1);
 expect((await admin(`events/${f.event.id}/imports/preview`,body)).status).toBe(409);
});
it('paginates previews while errors outside the visible rows still block the whole commit',async()=>{
 const rows=Array.from({length:201},(_,i)=>({row:i+2,values:{guestCode:'G'+i,fullName:'Guest '+i},action:'CREATE'}));
 const errors=Array.from({length:101},(_,i)=>({row:i+300,column:'guest_code',message:'Invalid code'}));
 const batch=await prisma.importBatch.create({data:{eventId:f.event.id,createdBy:f.admin.id,fileHash:'unused',mappingJson:{guest_code:'code',full_name:'name'},normalizedRowsJson:{sheet:'Guests',rows,errors,warnings:[]},summaryJson:{created:201,updated:0,unchanged:0,errors:101,warnings:0},expiresAt:new Date(Date.now()+3600000)}});
 const page=await request(app).get(`/api/v1/admin/imports/${batch.id}?page=2`).set('Cookie',f.cookie);
 expect(page.status).toBe(200);expect(page.body.data.rows).toHaveLength(100);expect(page.body.data.rows[0].row).toBe(102);
 expect(page.body.data.errors).toHaveLength(1);expect(page.body.data.pagination).toEqual({page:2,pageSize:100,pages:3,totalRows:201,totalErrors:101,totalWarnings:0});
 expect((await admin(`imports/${batch.id}/commit`,{})).status).toBe(422);
});
it('counts live PUT capabilities even after their source was claimed',async()=>{
 const previous={storageDriver:config.storageDriver,storageEndpoint:config.storageEndpoint,storageRegion:config.storageRegion,storageAccessKey:config.storageAccessKey,storageSecretKey:config.storageSecretKey,storageBucketPrivate:config.storageBucketPrivate};
 Object.assign(config,{storageDriver:'s3',storageEndpoint:'http://127.0.0.1:9',storageRegion:'us-east-1',storageAccessKey:'test-access',storageSecretKey:'test-secret',storageBucketPrivate:'private'});
 try{
  await prisma.temporaryObject.createMany({data:Array.from({length:20},()=>({adminId:f.admin.id,eventId:f.event.id,purpose:'MEDIA',storageKey:`${f.event.id}/${randomUUID()}/source.bin`,originalName:'photo.jpg',bytes:100,claimedAt:new Date(),uploadExpiresAt:new Date(Date.now()+300000),expiresAt:new Date(Date.now()+1800000)}))});
  expect((await admin(`events/${f.event.id}/uploads`,{purpose:'IMPORT',name:'guests.xlsx',bytes:100})).status).toBe(429);
 }finally{Object.assign(config,previous);}
});
it.each([[16384,3],[200,50]])('rejects inspect metadata with header length %i across %i sheets',async(length,sheets)=>{
  const book=new ExcelJS.Workbook();for(let i=0;i<sheets;i++)book.addWorksheet('Sheet'+i).addRow(Array(100).fill('字'.repeat(length)));
  const response=await request(app).post(`/api/v1/admin/events/${f.event.id}/imports/inspect`).set('Cookie',f.cookie).set('Origin','http://localhost:5173').set('X-CSRF-Token',f.csrf).attach('file',Buffer.from(await book.xlsx.writeBuffer()),'headers.xlsx');
  expect(response.status).toBe(422);expect(Buffer.byteLength(response.text)).toBeLessThan(4096);
});

import { beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseWorkbook, normalizeRows } from '../src/excel-parser.js';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { setupTestData,resetTestDatabase } from './helpers.js';
import { crc32,deflateRawSync } from 'node:zlib';

async function workbook(rows: unknown[][]) {
 const book=new ExcelJS.Workbook();book.addWorksheet('Khách').addRows(rows);
 return Buffer.from(await book.xlsx.writeBuffer());
}
function inflatedArchive(){
 const plain=Buffer.alloc(11*1024*1024,120),compressed=deflateRawSync(plain),parts:Buffer[]=[],directory:Buffer[]=[];let offset=0;
 for(const name of ['xl/sharedStrings.xml','xl/worksheets/sheet1.xml']){
  const filename=Buffer.from(name),local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt32LE(crc32(plain),14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(plain.length,22);local.writeUInt16LE(filename.length,26);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(8,10);entry.writeUInt32LE(crc32(plain),16);entry.writeUInt32LE(compressed.length,20);entry.writeUInt32LE(plain.length,24);entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE(offset,42);
  parts.push(local,filename,compressed);directory.push(entry,filename);offset+=local.length+filename.length+compressed.length;
 }
 const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(2,8);end.writeUInt16LE(2,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...parts,central,end]);
}
describe('bounded XLSX import',()=>{
 it('inspects sheets and preserves phone strings',async()=>{
  const bytes=await workbook([['Mã','Tên','Phone'],[' a01 ',' Người mẫu ','0123456789']]);
  expect((await parseWorkbook(bytes)).sheets[0]).toEqual({name:'Khách',headers:['Mã','Tên','Phone']});
  const parsed=await parseWorkbook(bytes,'Khách',{guest_code:'Mã',full_name:'Tên',phone:'Phone'});
  const normalized=normalizeRows(parsed.rows!,{guest_code:'Mã',full_name:'Tên',phone:'Phone'});
  expect(normalized.errors).toEqual([]);expect(normalized.rows[0].values).toMatchObject({guestCode:'A01',fullName:'Người mẫu',phone:'0123456789'});
 });
 it('rejects formulas even in unmapped data columns and never uses their cached value',async()=>{
  const bytes=await workbook([['guest_code','full_name','extra'],['A1','Name',{formula:'1+1',result:2}]]);
  const parsed=await parseWorkbook(bytes,'Khách',{guest_code:'guest_code',full_name:'full_name'});
  expect(normalizeRows(parsed.rows!,{guest_code:'guest_code',full_name:'full_name'}).errors[0].message).toMatch(/công thức/i);
 });
 it('reports duplicate codes and invalid emails with row context',()=>{
  const result=normalizeRows([{row:2,values:{guest_code:'a',full_name:'A',email:'bad'}},{row:3,values:{guest_code:'A',full_name:'B'}}],{guest_code:'Code',full_name:'Name',email:'Email'});
  expect(result.errors.map(e=>e.row)).toEqual(expect.arrayContaining([2,3]));
 });
 it('rejects numeric phones instead of losing initial zeros',async()=>{
  const parsed=await parseWorkbook(await workbook([['Code','Name','Phone'],['A','A',1234]]),'Khách',{guest_code:'Code',full_name:'Name',phone:'Phone'});
  expect(normalizeRows(parsed.rows!,{guest_code:'Code',full_name:'Name',phone:'Phone'}).errors[0].column).toBe('phone');
 });
 it('rejects oversized row counts and invalid archives',async()=>{
  await expect(parseWorkbook(Buffer.from('not a zip'))).rejects.toThrow();
  await expect(parseWorkbook(await workbook([['Code','Name'],...Array.from({length:2001},(_,i)=>[String(i),'Name'])]),'Khách',{guest_code:'Code',full_name:'Name'})).rejects.toThrow(/2.000|2000/);
 });
 it('stops actual streamed inflation across entries before parsing XML',async()=>{
  const compressed=inflatedArchive();expect(compressed.length).toBeLessThan(5*1024*1024);
  await expect(parseWorkbook(compressed)).rejects.toThrow('Dữ liệu giải nén vượt 20 MB');
 });
});

describe('persisted atomic imports and admin exports',()=>{
 const app=createApp();let f:Awaited<ReturnType<typeof setupTestData>>;
 const admin=(method:'get'|'post',path:string)=>request(app)[method](`/api/v1/admin/${path}`).set('Cookie',f.cookie).set('Origin','http://localhost:5173').set('X-CSRF-Token',f.csrf);
 const preview=async(rows:unknown[][],mapping:Record<string,string>={guest_code:'Code',full_name:'Name',phone:'Phone'})=>admin('post',`events/${f.event.id}/imports/preview`).field('sheet','Khách').field('mapping',JSON.stringify(mapping)).attach('file',await workbook(rows),'guests.xlsx');
 beforeEach(async()=>{await resetTestDatabase();f=await setupTestData();});
 it('requires admin and produces a string-only template with phone Text',async()=>{
  expect((await request(app).get('/api/v1/admin/imports/template')).status).toBe(401);
  const response=await admin('get','imports/template').responseType('blob');expect(response.status).toBe(200);
  const book=new ExcelJS.Workbook();await book.xlsx.load(response.body);expect(book.worksheets[0].getCell('H2').value).toBe('0123456789');expect(book.worksheets[0].getCell('H2').numFmt).toBe('@');
 });
 it('commits once, retains links and history, clears mapped optional fields and preserves unmapped values',async()=>{
  await prisma.guest.update({where:{id:f.guest.id},data:{phone:'0999',email:'keep@example.test',archivedAt:new Date()}});
  await prisma.rSVP.create({data:{invitationId:f.invitation.id,status:'ATTENDING'}});
  const response=await preview([['Code','Name','Phone'],[f.guest.guestCode,'Changed',''],['NEW001','New','0123']]);expect(response.status).toBe(201);const id=response.body.data.id;
  const key=randomUUID(),commit=()=>admin('post',`imports/${id}/commit`).set('Idempotency-Key',key).send({});
  const first=await commit();expect(first.status).toBe(200);expect(first.body.data).toEqual({created:1,updated:1,unchanged:0});expect((await commit()).body.data).toEqual(first.body.data);
  await prisma.importBatch.update({where:{id},data:{expiresAt:new Date(Date.now()-1)}});
  expect((await admin('post',`imports/${id}/commit`).set('Idempotency-Key',randomUUID()).send({})).body.data).toEqual(first.body.data);
  const guest=await prisma.guest.findUniqueOrThrow({where:{id:f.guest.id},include:{invitation:{include:{rsvp:true}}}});
  expect(guest).toMatchObject({fullName:'Changed',phone:'',email:'keep@example.test'});expect(guest.archivedAt).not.toBeNull();expect(guest.invitation?.tokenCiphertext).toBe(f.invitation.tokenCiphertext);expect(guest.invitation?.rsvp?.status).toBe('ATTENDING');expect(await prisma.guest.count()).toBe(2);
  const second=await preview([['Code','Name','Phone'],['NEW002','Another','']]);
  expect((await admin('post',`imports/${second.body.data.id}/commit`).set('Idempotency-Key',key).send({})).status).toBe(409);
 });
 it('rolls back new guests when either existing entity changed since preview',async()=>{
  const response=await preview([['Code','Name','Phone'],['NEW001','New','0123'],[f.guest.guestCode,'Changed','']]);
  await prisma.invitation.update({where:{id:f.invitation.id},data:{version:{increment:1}}});
  const commit=await admin('post',`imports/${response.body.data.id}/commit`).set('Idempotency-Key',randomUUID()).send({});expect(commit.status).toBe(409);expect(commit.body.error.code).toBe('IMPORT_STALE');expect(await prisma.guest.count()).toBe(1);expect(await prisma.idempotencyRecord.count()).toBe(0);
 });
 it('blocks all rows on formula errors and provides row-level report',async()=>{
  const response=await preview([['Code','Name','Phone'],['A','Valid','0123'],['B',{formula:'1+1',result:2},'']]);expect(response.status).toBe(201);expect(response.body.data.errors[0]).toMatchObject({sheet:'Khách',row:3});
  const id=response.body.data.id;expect((await admin('post',`imports/${id}/commit`).set('Idempotency-Key',randomUUID()).send({})).status).toBe(422);expect(await prisma.guest.count()).toBe(1);
  const report=await admin('get',`imports/${id}/report`).responseType('blob');expect(report.status).toBe(200);const book=new ExcelJS.Workbook();await book.xlsx.load(report.body);expect(book.worksheets[0].getCell('B2').value).toBe('3');
 });
 it('rejects expired previews and another owner event',async()=>{
  const response=await preview([['Code','Name','Phone'],['A','Valid','0123']]);const id=response.body.data.id;await prisma.importBatch.update({where:{id},data:{expiresAt:new Date(Date.now()-1)}});
  expect((await admin('post',`imports/${id}/commit`).set('Idempotency-Key',randomUUID()).send({})).body.error.code).toBe('IMPORT_EXPIRED');
  const owner=await prisma.adminUser.create({data:{email:'other@example.test',passwordHash:'unused'}}),event=await prisma.event.create({data:{ownerId:owner.id,slug:'other'}});
  expect((await admin('post',`events/${event.id}/imports/inspect`).attach('file',await workbook([['A']]),'test.xlsx')).status).toBe(404);
 });
 it('exports formula-like input as string cells with filter metadata',async()=>{
  await prisma.guest.update({where:{id:f.guest.id},data:{fullName:'=SUM(1,2)',phone:'+0123'}});
  const response=await admin('get',`events/${f.event.id}/exports/links`).responseType('blob');expect(response.status).toBe(200);expect(response.headers['cache-control']).toContain('no-store');
  const book=new ExcelJS.Workbook();await book.xlsx.load(response.body);const sheet=book.worksheets[1];expect(sheet.getCell('B2').value).toBe('=SUM(1,2)');expect(sheet.getCell('H2').value).toBe('+0123');expect(sheet.getCell('K2').value).toContain('/i/');expect(book.worksheets[0].getCell('B2').value).toContain('archived');
 });
});

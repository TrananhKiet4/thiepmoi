import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { randomUUID, createHash } from 'node:crypto';
import { prisma } from './db.js';
import { config } from './config.js';
import { requireAdmin } from './auth.js';
import { AppError, ok, ownedEvent, audit, idempotent } from './http.js';
import { createInvitationToken, decryptInvitationToken, hashToken } from './crypto.js';
import { columns, validateMapping, parseWorkbook, normalizeRows, type Mapping, type NormalizedRow, type RowError } from './excel-parser.js';

export const importRouter=Router();
const uuid=z.string().uuid(),upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:2,fieldSize:16000,parts:3}}).single('file');
const receive=(req:Request,res:Response,next:any)=>upload(req,res,error=>error?next(new AppError(413,'UPLOAD_LIMIT','XLSX tối đa 5 MB, một file mỗi lần')):next());
type StoredRows={sheet:string;rows:NormalizedRow[];errors:RowError[];warnings:RowError[]};
function file(req:Request){if(!req.file||!req.file.originalname.toLowerCase().endsWith('.xlsx'))throw new AppError(422,'INVALID_XLSX','Chỉ nhận file .xlsx');return req.file.buffer;}
function batchView(batch:any){const payload=batch.normalizedRowsJson as StoredRows;return {id:batch.id,status:batch.status,summary:batch.summaryJson,rows:payload.rows,errors:payload.errors.map(e=>({sheet:payload.sheet,...e})),warnings:payload.warnings,expiresAt:batch.expiresAt};}
async function getBatch(req:Request,id:string,tx:any=prisma){const batch=await tx.importBatch.findUnique({where:{id:uuid.parse(id)}});if(!batch)throw new AppError(404,'NOT_FOUND','Không tìm thấy lần nhập');await ownedEvent(req,batch.eventId,tx);if(batch.createdBy!==req.admin!.id)throw new AppError(404,'NOT_FOUND','Không tìm thấy lần nhập');return batch;}
async function sendWorkbook(res:Response,book:ExcelJS.Workbook,name:string){res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${name}.xlsx"`,'Cache-Control':'private, no-store'});res.send(Buffer.from(await book.xlsx.writeBuffer()));}
function textSheet(book:ExcelJS.Workbook,name:string,headers:string[],rows:unknown[][]){const sheet=book.addWorksheet(name);sheet.addRow(headers);for(const values of rows)sheet.addRow(values.map(value=>value===null||value===undefined?'':String(value)));for(const col of sheet.columns){col.numFmt='@';col.width=24;}sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}];return sheet;}

importRouter.get('/admin/imports/template',requireAdmin,async(_req,res)=>{
 const book=new ExcelJS.Workbook();textSheet(book,'Khách mời',Object.keys(columns),[['DEMO001','Khách mẫu','Bạn mẫu','ban_be','Bạn','Hẹn gặp bạn trong ngày tốt nghiệp!','demo@example.com','0123456789']]);
 await sendWorkbook(res,book,'mau-khach-moi');
});
importRouter.post('/admin/events/:id/imports/inspect',requireAdmin,receive,async(req,res)=>{
 await ownedEvent(req,uuid.parse(req.params.id));try{ok(res,await parseWorkbook(file(req)));}catch(error){if(error instanceof AppError)throw error;throw new AppError(422,'INVALID_XLSX',(error as Error).message);}
});
importRouter.post('/admin/events/:id/imports/preview',requireAdmin,receive,async(req,res)=>{
 const eventId=uuid.parse(req.params.id);await ownedEvent(req,eventId);const bytes=file(req);let mapping:Mapping,parsed;
 try{mapping=JSON.parse(req.body.mapping);validateMapping(mapping);const sheet=z.string().min(1).max(100).parse(req.body.sheet);parsed=await parseWorkbook(bytes,sheet,mapping);}catch(error){throw new AppError(422,'INVALID_XLSX',(error as Error).message);}
 const normalized=normalizeRows(parsed.rows!,mapping),existing=await prisma.guest.findMany({where:{eventId,guestCode:{in:normalized.rows.map(row=>row.values.guestCode)}},include:{invitation:true}}),byCode=new Map(existing.map(g=>[g.guestCode,g]));
 const summary={created:0,updated:0,unchanged:0,errors:normalized.errors.length,warnings:normalized.warnings.length};
 for(const row of normalized.rows){
  const guest=byCode.get(row.values.guestCode);
  if(!guest){row.action='CREATE';summary.created++;continue;}
  if(!guest.invitation)throw new AppError(409,'INVALID_GUEST','Khách hiện có chưa có thiệp');
  row.guestId=guest.id;row.invitationId=guest.invitation.id;row.expectedGuestVersion=guest.version;row.expectedInvitationVersion=guest.invitation.version;
  const changed=Object.entries(row.values).some(([key,value])=>key==='personalMessage'?guest.invitation!.personalMessage!==value:(guest as any)[key]!==value);
  row.action=changed?'UPDATE':'UNCHANGED';changed?summary.updated++:summary.unchanged++;
 }
 const batch=await prisma.importBatch.create({data:{eventId,createdBy:req.admin!.id,fileHash:createHash('sha256').update(bytes).digest('hex'),mappingJson:mapping,normalizedRowsJson:JSON.parse(JSON.stringify({sheet:req.body.sheet,...normalized})),summaryJson:summary,expiresAt:new Date(Date.now()+86400000)}});
 ok(res,batchView(batch),201);
});
importRouter.get('/admin/imports/:id',requireAdmin,async(req,res)=>ok(res,batchView(await getBatch(req,uuid.parse(req.params.id)))));
importRouter.get('/admin/imports/:id/report',requireAdmin,async(req,res)=>{
 const batch=await getBatch(req,uuid.parse(req.params.id)),payload=batch.normalizedRowsJson as unknown as StoredRows,book=new ExcelJS.Workbook();
 textSheet(book,'Lỗi',['sheet','row','column','message'],payload.errors.map(e=>[payload.sheet,e.row,e.column,e.message]));textSheet(book,'Cảnh báo',['sheet','row','column','message'],payload.warnings.map(e=>[payload.sheet,e.row,e.column,e.message]));await sendWorkbook(res,book,'bao-cao-nhap');
});
importRouter.post('/admin/imports/:id/commit',requireAdmin,async(req,res)=>{
 const id=uuid.parse(req.params.id);z.object({}).strict().parse(req.body);await getBatch(req,id);
 const result=await idempotent(req,'import:commit',hashToken(req.admin!.id),{batchId:id},async tx=>{
  await tx.$queryRaw`SELECT id FROM "ImportBatch" WHERE id=${id}::uuid FOR UPDATE`;
  const batch=await getBatch(req,id,tx);if(batch.status==='COMMITTED')return batch.resultJson;
  if(batch.expiresAt.getTime()<=Date.now())throw new AppError(409,'IMPORT_EXPIRED','Bản xem trước đã hết hạn; vui lòng nhập lại');
  const payload=batch.normalizedRowsJson as unknown as StoredRows;if(payload.errors.length)throw new AppError(422,'IMPORT_HAS_ERRORS','Phải sửa toàn bộ dòng lỗi trước khi nhập');
  const counts={created:0,updated:0,unchanged:0};
  for(const row of payload.rows){
   const current=await tx.guest.findUnique({where:{eventId_guestCode:{eventId:batch.eventId,guestCode:row.values.guestCode}},include:{invitation:true}});
   if(!row.guestId){
    if(current)throw new AppError(409,'IMPORT_STALE','Danh sách khách đã thay đổi; vui lòng xem trước lại');
    const id=randomUUID(),{token:_token,...encrypted}=createInvitationToken(id),{personalMessage='',...guest}=row.values;
    await tx.guest.create({data:{...guest,guestCode:guest.guestCode,fullName:guest.fullName,eventId:batch.eventId,invitation:{create:{id,eventId:batch.eventId,personalMessage,...encrypted}}}});counts.created++;continue;
   }
   if(!current||current.id!==row.guestId||current.version!==row.expectedGuestVersion||!current.invitation||current.invitation.id!==row.invitationId||current.invitation.version!==row.expectedInvitationVersion)throw new AppError(409,'IMPORT_STALE','Khách hoặc thiệp đã thay đổi; vui lòng xem trước lại');
   const guestChanges:Record<string,string>={};for(const [key,value] of Object.entries(row.values))if(key!=='personalMessage'&&(current as any)[key]!==value)guestChanges[key]=value;
   const invitationChanged='personalMessage' in row.values&&current.invitation.personalMessage!==row.values.personalMessage;
   if(Object.keys(guestChanges).length){const changed=await tx.guest.updateMany({where:{id:current.id,version:row.expectedGuestVersion},data:{...guestChanges,version:{increment:1}}});if(!changed.count)throw new AppError(409,'IMPORT_STALE','Khách đã thay đổi');}
   if(invitationChanged){const changed=await tx.invitation.updateMany({where:{id:current.invitation.id,version:row.expectedInvitationVersion},data:{personalMessage:row.values.personalMessage,version:{increment:1}}});if(!changed.count)throw new AppError(409,'IMPORT_STALE','Thiệp đã thay đổi');}
   Object.keys(guestChanges).length||invitationChanged?counts.updated++:counts.unchanged++;
  }
  await tx.importBatch.update({where:{id},data:{status:'COMMITTED',committedAt:new Date(),resultJson:counts}});await audit(tx,req,'IMPORT_COMMIT',batch.eventId,'ImportBatch',id,counts);return counts;
 });ok(res,result);
});
importRouter.get('/admin/events/:id/exports/:kind',requireAdmin,async(req,res)=>{
 const eventId=uuid.parse(req.params.id);await ownedEvent(req,eventId);const kind=z.enum(['links','responses']).parse(req.params.kind);
 const query=z.object({q:z.string().max(200).optional(),group:z.string().max(60).optional(),status:z.enum(['ATTENDING','DECLINED','UNANSWERED']).optional(),archived:z.enum(['true','false','all']).default('false'),history:z.enum(['true','false']).default('false'),sort:z.enum(['guestCode','fullName','createdAt']).default('guestCode')}).parse(req.query);
 const where:any={eventId};if(query.history!=='true'&&query.archived!=='all')where.archivedAt=query.archived==='true'?{not:null}:null;
 if(query.q)where.OR=['guestCode','fullName','displayName'].map(key=>({[key]:{contains:query.q,mode:'insensitive'}}));if(query.group)where.groupKey=query.group;
 if(query.status)where.invitation={is:{...(query.status==='UNANSWERED'?{rsvp:{is:null}}:{rsvp:{is:{status:query.status}}}),...(query.history!=='true'?{revokedAt:null}:{})}};
 const guests=await prisma.guest.findMany({where,include:{invitation:{include:{rsvp:true,wish:true}}},orderBy:{[query.sort]:'asc'}}),book=new ExcelJS.Workbook();
 textSheet(book,'Thông tin',['exported_at','filters'],[[new Date().toISOString(),JSON.stringify(query)]]);
 const headers=['guest_code','full_name','display_name','group','salutation','personal_message','email','phone','archived_at','revoked_at'];
 if(kind==='links')headers.push('invitation_url');else headers.push('rsvp_status','rsvp_note','rsvp_updated_at','wish','consent_public','moderation_status','wish_deleted_at');
 const rows=guests.map(g=>{const i=g.invitation,row:unknown[]=[g.guestCode,g.fullName,g.displayName,g.groupKey,g.salutation,i?.personalMessage??'',g.email,g.phone,g.archivedAt?.toISOString(),i?.revokedAt?.toISOString()];
  if(kind==='links')row.push(i?`${config.appOrigin}/i/${decryptInvitationToken(i.id,i.tokenCiphertext,i.keyVersion)}`:'');
  else row.push(i?.rsvp?.status??'UNANSWERED',i?.rsvp?.note??'',i?.rsvp?.updatedAt.toISOString(),i?.wish?.body??'',i?.wish?.consentPublic??false,i?.wish?.moderationStatus??'NONE',i?.wish?.deletedAt?.toISOString());return row;});
 textSheet(book,kind==='links'?'Link thiệp':'Phản hồi',headers,rows);await sendWorkbook(res,book,kind==='links'?'link-thiep':'phan-hoi');
});

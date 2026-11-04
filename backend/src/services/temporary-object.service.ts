import {randomUUID} from 'node:crypto';
import type {Request} from 'express';
import {z} from 'zod';
import {prisma,withTransaction} from '../config/database.js';
import {config} from '../config/env.js';
import {AppError} from '../errors/app-error.js';
import {ownedEvent} from '../utils/http.js';
import {deleteStored,readStored,storedSize,uploadUrl,putPrivate,privateDownloadUrl} from './storage.service.js';

const inputSchema=z.object({purpose:z.enum(['MEDIA','IMPORT']),name:z.string().min(1).max(255),bytes:z.number().int().positive()}).strict().superRefine((value,ctx)=>{
 const max=value.purpose==='MEDIA'?10:5;
 if(value.bytes>max*1024*1024)ctx.addIssue({code:'custom',path:['bytes'],message:`File tối đa ${max} MB`});
 if(!(value.purpose==='MEDIA'?/\.(jpe?g|png|webp|mp3|m4a)$/i:/\.xlsx$/i).test(value.name))ctx.addIssue({code:'custom',path:['name'],message:'Định dạng file không hợp lệ'});
});
export async function createUpload(req:Request,eventId:string,input:unknown){
 await ownedEvent(req,eventId);const value=inputSchema.parse(input);
 if(config.storageDriver==='local')return {mode:'multipart' as const};
 const id=randomUUID(),now=new Date(),storageKey=`${eventId}/${id}/source.bin`;
 await withTransaction(async tx=>{
  if(await tx.temporaryObject.count({where:{adminId:req.admin!.id,purpose:{in:['MEDIA','IMPORT']},claimedAt:null,expiresAt:{gt:now}}})>=20)throw new AppError(429,'UPLOAD_LIMIT','Tối đa 20 file đang chờ; vui lòng thử lại sau');
  await tx.temporaryObject.create({data:{id,adminId:req.admin!.id,eventId,purpose:value.purpose,storageKey,originalName:value.name.replace(/[\x00-\x1f\x7f\\/]/g,'_'),bytes:value.bytes,uploadExpiresAt:new Date(now.getTime()+300000),expiresAt:new Date(now.getTime()+1800000)}});
 });
 return {mode:'direct' as const,uploadId:id,url:await uploadUrl(storageKey,value.bytes),headers:{'Content-Type':'application/octet-stream'}};
}
export async function readUpload(req:Request,eventId:string,id:string,purpose:'MEDIA'|'IMPORT',claim=false){
 const object=await prisma.temporaryObject.findFirst({where:{id:z.string().uuid().parse(id),adminId:req.admin!.id,eventId,purpose}});
 if(!object)throw new AppError(404,'UPLOAD_NOT_FOUND','Không tìm thấy file tải lên');
 if(object.expiresAt<=new Date()||object.claimedAt)throw new AppError(409,'UPLOAD_EXPIRED','File đã xử lý hoặc hết hạn; vui lòng tải lại');
 const maxBytes=(purpose==='MEDIA'?10:5)*1024*1024;
 if(object.bytes<=0||object.bytes>maxBytes)throw new AppError(413,'UPLOAD_LIMIT','File vượt giới hạn');
 if(claim){const changed=await prisma.temporaryObject.updateMany({where:{id:object.id,claimedAt:null,expiresAt:{gt:new Date()}},data:{claimedAt:new Date()}});if(!changed.count)throw new AppError(409,'UPLOAD_EXPIRED','File đã xử lý hoặc hết hạn; vui lòng tải lại');}
 try{
  if(await storedSize(object.storageKey)!==object.bytes)throw new AppError(413,'UPLOAD_SIZE','Kích thước file không khớp; vui lòng tải lại');
  const bytes=await readStored(object.storageKey,false,object.bytes);
  if(bytes.length!==object.bytes)throw new AppError(413,'UPLOAD_SIZE','Kích thước file không khớp; vui lòng tải lại');
  return {bytes,name:object.originalName,uploadId:object.id};
 }catch(error){
  if(claim)await deleteStored(object.storageKey).catch(()=>{});
  if(error instanceof AppError)throw error;
  throw new AppError(409,'UPLOAD_NOT_READY','Chưa đọc được file tải lên; vui lòng tải lại');
 }
}
export async function deleteUploadSource(id:string){const object=await prisma.temporaryObject.findUnique({where:{id}});if(object)await deleteStored(object.storageKey);}
export async function createExport(req:Request,bytes:Buffer,name:string){
 const event=await prisma.event.findFirstOrThrow({where:{ownerId:req.admin!.id},select:{id:true}}),id=randomUUID(),storageKey=`${event.id}/${id}/export.xlsx`,now=new Date();
 await prisma.temporaryObject.create({data:{id,eventId:event.id,adminId:req.admin!.id,purpose:'EXPORT',storageKey,originalName:name,bytes:bytes.length,claimedAt:now,uploadExpiresAt:now,expiresAt:new Date(now.getTime()+600000)}});
 await putPrivate(storageKey,bytes,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 return privateDownloadUrl(storageKey,name);
}
export async function cleanupTemporaryObjects(limit=100){
 const objects=await prisma.temporaryObject.findMany({where:{expiresAt:{lt:new Date()},uploadExpiresAt:{lt:new Date(Date.now()-60000)}},orderBy:{expiresAt:'asc'},take:limit});
 let deleted=0,failed=0;const deadline=Date.now()+20000;
 for(const object of objects){if(Date.now()>deadline)break;try{await deleteStored(object.storageKey);await prisma.temporaryObject.delete({where:{id:object.id}});deleted++;}catch{failed++;}}
 return {deleted,failed};
}

import type {Request,Response} from 'express';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {prisma,withTransaction,type Tx} from '../config/database.js';
import {hashToken} from './token.js';
import {AppError} from '../errors/app-error.js';

export function ok(res:Response,data:unknown,status=200){return res.status(status).json({data});}
export async function ownedEvent(req:Request,eventId:string,tx:Tx|typeof prisma=prisma){
 if(!z.string().uuid().safeParse(eventId).success)throw new AppError(404,'NOT_FOUND','Không tìm thấy sự kiện');
 const event=await tx.event.findFirst({where:{id:eventId,ownerId:req.admin!.id}});
 if(!event)throw new AppError(404,'NOT_FOUND','Không tìm thấy sự kiện');return event;
}
export function pagination(req:Request){const q=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(25)}).parse(req.query);return {...q,skip:(q.page-1)*q.pageSize};}
export async function audit(tx:Tx,req:Request,action:string,eventId:string,entityType:string,entityId:string,metadata:Record<string,unknown>={}){
 await tx.auditLog.create({data:{actorAdminId:req.admin?.id??null,action,eventId,entityType,entityId,metadata:metadata as Prisma.InputJsonValue}});
}
function canonical(value:any):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export async function assertGuestActive(tx:Tx,invitationId:string,expectedTokenHash?:string){
 const inv=await tx.invitation.findUnique({where:{id:invitationId},include:{event:true,guest:true,rsvp:true,wish:true}});
 if(!inv||inv.revokedAt||inv.guest.archivedAt||(expectedTokenHash&&inv.tokenHash!==expectedTokenHash))throw new AppError(404,'INVITATION_NOT_AVAILABLE','Thiệp không khả dụng');
 if(!inv.event.publishedRevisionId)throw new AppError(404,'EVENT_NOT_AVAILABLE','Thiệp chưa sẵn sàng');return inv;
}
export async function idempotent<T>(req:Request,scope:string,actorKeyHash:string,body:unknown,fn:(tx:Tx)=>Promise<T>):Promise<T>{
 const key=req.get('Idempotency-Key');if(!key||key.length>128||!/^[-\w]+$/.test(key))throw new AppError(400,'IDEMPOTENCY_KEY_REQUIRED','Thiếu Idempotency-Key hợp lệ');
 const requestHash=hashToken(canonical(body)),where={scope_actorKeyHash_key:{scope,actorKeyHash,key}};
 // Serialize identical keys before reading replay state, including simultaneous first requests.
 return withTransaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope+actorKeyHash+key},0))::text`;
  if(req.invitation){await tx.$queryRaw`SELECT id FROM "Event" WHERE id=${req.invitation.eventId}::uuid FOR UPDATE`;await tx.$queryRaw`SELECT id FROM "Invitation" WHERE id=${req.invitation.id}::uuid FOR UPDATE`;await assertGuestActive(tx,req.invitation.id,req.invitation.tokenHash);}
  const record=await tx.idempotencyRecord.findUnique({where});
  if(record&&record.expiresAt>new Date()){if(record.requestHash!==requestHash)throw new AppError(409,'IDEMPOTENCY_CONFLICT','Khóa gửi lại đã được dùng với nội dung khác');return record.responseJson as T;}
  if(record)await tx.idempotencyRecord.delete({where:{id:record.id}});
  const result=await fn(tx);const json=JSON.parse(JSON.stringify(result??null));
  await tx.idempotencyRecord.create({data:{scope,actorKeyHash,key,requestHash,responseStatus:200,responseJson:json,expiresAt:new Date(Date.now()+86400000)}});return json as T;
 });
}

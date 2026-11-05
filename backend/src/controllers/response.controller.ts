import {type Request} from 'express';
import {z} from 'zod';
import type {Prisma} from '@prisma/client';
import {contentSchema,rsvpSchema,wishSchema,versionSchema} from '../../../packages/contracts/src/index.js';
import {withTransaction,type Tx} from '../config/database.js';
import {AppError} from '../errors/app-error.js';
import {assertGuestActive,audit,idempotent,ok,ownedEvent,pagination} from '../utils/http.js';
import {hashToken} from '../utils/token.js';
import {canWrite,createCalendar,publicWish} from '../utils/invitation.js';
import {conflict,invitationView,lockEvent,rsvpView,wishView} from '../services/event.service.js';
import type {RequestHandler} from 'express';

export async function active(tx:Tx,req:Request,write=false){if(write){await lockEvent(tx,req.invitation!.eventId);await tx.$queryRaw`SELECT id FROM "Invitation" WHERE id=${req.invitation!.id}::uuid FOR UPDATE`;}return assertGuestActive(tx,req.invitation!.id,req.invitation!.tokenHash);}
export async function publishedContent(tx:Tx,inv:Awaited<ReturnType<typeof active>>){const revision=await tx.eventRevision.findFirst({where:{id:inv.event.publishedRevisionId!,eventId:inv.eventId}});if(!revision)throw new AppError(404,'EVENT_NOT_AVAILABLE','Thiệp chưa sẵn sàng');return contentSchema.parse(revision.contentJson);}
export const cursorSchema=z.object({p:z.boolean(),a:z.string().datetime(),id:z.string().uuid()}).strict();
export const wishInclude={invitation:{include:{guest:true}}} as const;
export function adminWishView(wish:Prisma.WishGetPayload<{include:typeof wishInclude}>){const {invitation,...fields}=wish;return {...fields,invitation:{id:invitation.id,version:invitation.version,revokedAt:invitation.revokedAt,guest:invitation.guest}};}
export async function ownedWish(tx:Tx,req:Request,id:string){const w=await tx.wish.findUnique({where:{id},include:wishInclude});if(!w)throw new AppError(404,'NOT_FOUND','Không tìm thấy lời chúc');await ownedEvent(req,w.invitation.eventId,tx);return w;}
export const getGuestInvitation:RequestHandler=async(req,res)=>{ok(res,await withTransaction(async tx=>{const inv=await active(tx,req);return invitationView(await publishedContent(tx,inv),inv.event,inv.guest,inv,false,tx);}));};
export const postGuestOpened:RequestHandler=async(req,res)=>{ok(res,await withTransaction(async tx=>{const inv=await active(tx,req,true),now=new Date();const updated=await tx.invitation.update({where:{id:inv.id},data:{openedAt:inv.openedAt??now,lastOpenedAt:now},select:{openedAt:true,lastOpenedAt:true}});return updated;}));};
export const putGuestRsvp:RequestHandler=async(req,res)=>{
 const body=rsvpSchema.parse(req.body);
 ok(res,await idempotent(req,'guest.rsvp',hashToken(req.invitation!.id),body,async tx=>{
  const inv=await active(tx,req),content=await publishedContent(tx,inv);if(!canWrite(inv.event.rsvpEnabled,content.rsvpDeadline))throw new AppError(422,'RSVP_CLOSED','Đã đóng xác nhận tham gia');
  const {expectedVersion,...data}=body;if((inv.rsvp?.version??0)!==expectedVersion)throw conflict();
  return rsvpView(await(inv.rsvp?tx.rSVP.update({where:{invitationId:inv.id,version:expectedVersion},data:{...data,respondedAt:new Date(),version:{increment:1}}}):tx.rSVP.create({data:{invitationId:inv.id,...data}})));
 }));
};
export const putGuestWish:RequestHandler=async(req,res)=>{
 const body=wishSchema.parse(req.body);
 ok(res,await idempotent(req,'guest.wish',hashToken(req.invitation!.id),body,async tx=>{
  const inv=await active(tx,req),content=await publishedContent(tx,inv);if(!canWrite(inv.event.wishesEnabled,content.wishDeadline))throw new AppError(422,'WISHES_CLOSED','Đã đóng nhận lời chúc');
  const {expectedVersion,...fields}=body;if((inv.wish?.version??0)!==expectedVersion)throw conflict();
  const data={...fields,moderationStatus:fields.consentPublic?'PENDING':'NONE',isPinned:false,approvedAt:null,approvedBy:null,deletedAt:null};
  return wishView(await(inv.wish?tx.wish.update({where:{invitationId:inv.id,version:expectedVersion},data:{...data,version:{increment:1}}}):tx.wish.create({data:{invitationId:inv.id,...data}})));
 }));
};
export const patchGuestWishVisibility:RequestHandler=async(req,res)=>{
 const {expectedVersion}=versionSchema.extend({consentPublic:z.literal(false)}).parse(req.body);
 ok(res,await withTransaction(async tx=>{const inv=await active(tx,req,true);if(!inv.wish)throw new AppError(404,'NOT_FOUND','Chưa có lời chúc');if(inv.wish.version!==expectedVersion)throw conflict();return wishView(await tx.wish.update({where:{id:inv.wish.id,version:expectedVersion},data:{consentPublic:false,moderationStatus:'NONE',isPinned:false,approvedAt:null,approvedBy:null,version:{increment:1}}}));}));
};
export const deleteGuestWish:RequestHandler=async(req,res)=>{
 const {expectedVersion}=versionSchema.parse(req.body);
 await withTransaction(async tx=>{const inv=await active(tx,req,true);if(!inv.wish)throw new AppError(404,'NOT_FOUND','Chưa có lời chúc');if(inv.wish.version!==expectedVersion)throw conflict();await tx.wish.update({where:{id:inv.wish.id,version:expectedVersion},data:{deletedAt:new Date(),isPinned:false,version:{increment:1}}});});res.status(204).end();
};
export const getGuestWishes:RequestHandler=async(req,res)=>{
 const {cursor,limit}=z.object({cursor:z.string().max(512).optional(),limit:z.coerce.number().int().min(1).max(20).default(6)}).parse(req.query);
 let after:z.infer<typeof cursorSchema>|undefined;
 if(cursor){try{after=cursorSchema.parse(JSON.parse(Buffer.from(cursor,'base64url').toString('utf8')));}catch{throw new AppError(400,'CURSOR_INVALID','Phân trang không hợp lệ');}}
 ok(res,await withTransaction(async tx=>{
  const inv=await active(tx,req);if(!inv.event.wallEnabled)return {items:[],nextCursor:null};
  const where:Prisma.WishWhereInput={consentPublic:true,moderationStatus:'APPROVED',deletedAt:null,approvedAt:{not:null},invitation:{eventId:inv.eventId,revokedAt:null,guest:{archivedAt:null}}};
  if(after){const date=new Date(after.a);where.AND=[{OR:[...(after.p?[{isPinned:false}]:[]),{isPinned:after.p,approvedAt:{lt:date}},{isPinned:after.p,approvedAt:date,id:{lt:after.id}}]}];}
  const rows=await tx.wish.findMany({where,include:{invitation:{include:{guest:true}}},orderBy:[{isPinned:'desc'},{approvedAt:'desc'},{id:'desc'}],take:limit+1});
  const items=rows.slice(0,limit).map(w=>({id:w.id,displayName:w.invitation.guest.displayName||w.invitation.guest.fullName,body:w.body,approvedAt:w.approvedAt,isPinned:w.isPinned})),last=items.at(-1);
  return {items,nextCursor:rows.length>limit&&last?Buffer.from(JSON.stringify({p:last.isPinned,a:last.approvedAt!.toISOString(),id:last.id})).toString('base64url'):null};
 }));
};
export const getGuestCalendarIcs:RequestHandler=async(req,res)=>{const calendar=await withTransaction(async tx=>{const inv=await active(tx,req);return createCalendar(inv.eventId,await publishedContent(tx,inv));});res.set('Content-Disposition','attachment; filename="graduation.ics"').type('text/calendar; charset=utf-8').send(calendar);};
export const getAdminEventsWishes:RequestHandler=async(req,res)=>{
 const eventId=z.string().uuid().parse(req.params.id),{page,pageSize,skip}=pagination(req),status=z.preprocess(v=>v===''?undefined:v,z.enum(['NONE','PENDING','APPROVED','HIDDEN','DELETED']).optional()).parse(req.query.status);
 ok(res,await withTransaction(async tx=>{await ownedEvent(req,eventId,tx);const where:Prisma.WishWhereInput={invitation:{eventId},...(status==='DELETED'?{deletedAt:{not:null}}:status?{deletedAt:null,moderationStatus:status}:{})};const [rows,total]=await Promise.all([tx.wish.findMany({where,include:wishInclude,skip,take:pageSize,orderBy:[{updatedAt:'desc'},{id:'desc'}]}),tx.wish.count({where})]);return {items:rows.map(adminWishView),total,page,pageSize};}));
};
export const patchAdminWishesModeration:RequestHandler=async(req,res)=>{
 const id=z.string().uuid().parse(req.params.id),{expectedVersion,action}=versionSchema.extend({action:z.enum(['APPROVE','HIDE'])}).parse(req.body);
 ok(res,await withTransaction(async tx=>{const found=await ownedWish(tx,req,id);await lockEvent(tx,found.invitation.eventId);const wish=await ownedWish(tx,req,id);if(wish.version!==expectedVersion)throw conflict();if(wish.deletedAt||(action==='APPROVE'&&(!wish.consentPublic||wish.invitation.revokedAt||wish.invitation.guest.archivedAt)))throw new AppError(422,'WISH_NOT_PUBLIC','Lời chúc không đủ điều kiện công khai');
  const approved=action==='APPROVE';const updated=await tx.wish.update({where:{id,version:expectedVersion},data:{moderationStatus:approved?'APPROVED':wish.consentPublic?'HIDDEN':'NONE',isPinned:false,approvedAt:approved?new Date():null,approvedBy:approved?req.admin!.id:null,version:{increment:1}}});await audit(tx,req,`WISH_${action}`,wish.invitation.eventId,'Wish',id);return updated;
 }));
};
export const patchAdminWishesPin:RequestHandler=async(req,res)=>{
 const id=z.string().uuid().parse(req.params.id),{expectedVersion,isPinned}=versionSchema.extend({isPinned:z.boolean()}).parse(req.body);
 ok(res,await withTransaction(async tx=>{const found=await ownedWish(tx,req,id);await lockEvent(tx,found.invitation.eventId);const wish=await ownedWish(tx,req,id);if(wish.version!==expectedVersion)throw conflict();if(isPinned&&!publicWish(wish))throw new AppError(422,'WISH_NOT_PUBLIC','Chỉ ghim lời chúc đang công khai');const updated=await tx.wish.update({where:{id,version:expectedVersion},data:{isPinned,version:{increment:1}}});await audit(tx,req,isPinned?'WISH_PINNED':'WISH_UNPINNED',wish.invitation.eventId,'Wish',id);return updated;}));
};

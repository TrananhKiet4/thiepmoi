import {Router,type Request} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Prisma} from '@prisma/client';
import {guestSchema,rsvpSchema,versionSchema} from '../../../packages/contracts/src/index.js';
import {withTransaction,type Tx} from './db.js';
import {AppError,audit,ok,ownedEvent,pagination} from './http.js';
import {requireAdmin} from './auth.js';
import {createInvitationToken,decryptInvitationToken} from './crypto.js';
import {config} from './config.js';
import {conflict,lockEvent} from './events.js';

export const guestsRouter=Router();
const uuid=z.string().uuid();
const include={invitation:{include:{rsvp:true,wish:true}}} as const;
export function safeGuest(guest:Prisma.GuestGetPayload<{include:typeof include}>){
 const {invitation,...fields}=guest;
 return {...fields,personalMessage:invitation?.personalMessage??'',invitation:invitation?{id:invitation.id,version:invitation.version,personalMessage:invitation.personalMessage,revokedAt:invitation.revokedAt,openedAt:invitation.openedAt,lastOpenedAt:invitation.lastOpenedAt,rsvp:invitation.rsvp,wish:invitation.wish}:null};
}
export function guestFilter(req:Request,eventId:string):Prisma.GuestWhereInput{
 const q=z.object({q:z.string().trim().max(120).optional(),group:z.string().max(60).optional(),status:z.preprocess(v=>v===''?undefined:v,z.enum(['ATTENDING','DECLINED','UNANSWERED']).optional()),archived:z.enum(['true','false','all']).default('false')}).parse(req.query);
 return {eventId,...(q.archived==='all'?{}:{archivedAt:q.archived==='true'?{not:null}:null}),...(q.group?{groupKey:q.group}:{}),...(q.q?{OR:[{fullName:{contains:q.q,mode:'insensitive'}},{displayName:{contains:q.q,mode:'insensitive'}},{guestCode:{contains:q.q,mode:'insensitive'}}]}:{}),...(q.status?{invitation:q.status==='UNANSWERED'?{rsvp:{is:null}}:{rsvp:{status:q.status}}}:{})};
}
async function adminGuest(tx:Tx,req:Request,id:string){const guest=await tx.guest.findUnique({where:{id},include});if(!guest)throw new AppError(404,'NOT_FOUND','Không tìm thấy khách');await ownedEvent(req,guest.eventId,tx);return guest;}
async function adminInvitation(tx:Tx,req:Request,id:string){const invitation=await tx.invitation.findUnique({where:{id},include:{guest:true,rsvp:true}});if(!invitation)throw new AppError(404,'NOT_FOUND','Không tìm thấy thiệp');await ownedEvent(req,invitation.eventId,tx);return invitation;}
guestsRouter.get('/admin/events/:id/guests',requireAdmin,async(req,res)=>{
 const eventId=uuid.parse(req.params.id),{page,pageSize,skip}=pagination(req);
 const sort=z.enum(['guestCode','fullName','createdAt','-guestCode','-fullName','-createdAt']).default('guestCode').parse(req.query.sort);
 ok(res,await withTransaction(async tx=>{await ownedEvent(req,eventId,tx);const where=guestFilter(req,eventId),[items,total]=await Promise.all([tx.guest.findMany({where,include,skip,take:pageSize,orderBy:[{[sort.replace(/^-/,'')]:sort.startsWith('-')?'desc':'asc'},{id:'asc'}]}),tx.guest.count({where})]);return {items:items.map(safeGuest),total,page,pageSize};}));
});
guestsRouter.post('/admin/events/:id/guests',requireAdmin,async(req,res)=>{
 const eventId=uuid.parse(req.params.id),{personalMessage,...data}=guestSchema.parse(req.body);
 ok(res,await withTransaction(async tx=>{await lockEvent(tx,eventId);await ownedEvent(req,eventId,tx);const id=randomUUID(),{token,...encrypted}=createInvitationToken(id);const guest=await tx.guest.create({data:{eventId,...data,invitation:{create:{id,eventId,personalMessage,...encrypted}}},include});await audit(tx,req,'GUEST_CREATED',eventId,'Guest',guest.id);return safeGuest(guest);}),201);
});
guestsRouter.patch('/admin/guests/:id',requireAdmin,async(req,res)=>{
 const id=uuid.parse(req.params.id),{expectedVersion,expectedInvitationVersion,personalMessage,...data}=guestSchema.extend({expectedVersion:z.number().int().min(1),expectedInvitationVersion:z.number().int().min(1)}).parse(req.body);
 ok(res,await withTransaction(async tx=>{
  const found=await adminGuest(tx,req,id);await lockEvent(tx,found.eventId);const guest=await adminGuest(tx,req,id);
  if(guest.version!==expectedVersion||guest.invitation?.version!==expectedInvitationVersion)throw conflict();
  if(Object.entries(data).some(([k,v])=>guest[k as keyof typeof data]!==v))await tx.guest.update({where:{id,version:expectedVersion},data:{...data,version:{increment:1}}});
  if(guest.invitation.personalMessage!==personalMessage)await tx.invitation.update({where:{id:guest.invitation.id,version:expectedInvitationVersion},data:{personalMessage,version:{increment:1}}});
  await audit(tx,req,'GUEST_UPDATED',guest.eventId,'Guest',id);return safeGuest(await tx.guest.findUniqueOrThrow({where:{id},include}));
 }));
});
for(const action of ['archive','restore'] as const)guestsRouter.post(`/admin/guests/:id/${action}`,requireAdmin,async(req,res)=>{
 const id=uuid.parse(req.params.id),{expectedVersion}=versionSchema.parse(req.body);
 ok(res,await withTransaction(async tx=>{const found=await adminGuest(tx,req,id);await lockEvent(tx,found.eventId);const guest=await adminGuest(tx,req,id);if(guest.version!==expectedVersion)throw conflict();const updated=await tx.guest.update({where:{id,version:expectedVersion},data:{archivedAt:action==='archive'?new Date():null,version:{increment:1}},include});await audit(tx,req,`GUEST_${action.toUpperCase()}`,guest.eventId,'Guest',id);return safeGuest(updated);}));
});
guestsRouter.get('/admin/invitations/:id/link',requireAdmin,async(req,res)=>{
 ok(res,await withTransaction(async tx=>{const inv=await adminInvitation(tx,req,uuid.parse(req.params.id)),token=decryptInvitationToken(inv.id,inv.tokenCiphertext,inv.keyVersion),url=`${config.appOrigin}/i/${token}`;return {url,message:`Thân mời ${inv.guest.displayName||inv.guest.fullName} xem thiệp mời tốt nghiệp: ${url}`};}));
});
for(const action of ['revoke','rotate'] as const)guestsRouter.post(`/admin/invitations/:id/${action}`,requireAdmin,async(req,res)=>{
 const id=uuid.parse(req.params.id),{expectedVersion}=versionSchema.parse(req.body);
 ok(res,await withTransaction(async tx=>{const found=await adminInvitation(tx,req,id);await lockEvent(tx,found.eventId);const inv=await adminInvitation(tx,req,id);if(inv.version!==expectedVersion)throw conflict();
  let data:Prisma.InvitationUpdateInput={revokedAt:new Date(),version:{increment:1}};
  if(action==='rotate'){const {token,...encrypted}=createInvitationToken(id);data={...encrypted,revokedAt:null,version:{increment:1}};}
  const updated=await tx.invitation.update({where:{id,version:expectedVersion},data,select:{id:true,version:true,revokedAt:true}});await audit(tx,req,`INVITATION_${action.toUpperCase()}`,inv.eventId,'Invitation',id);return updated;
 }));
});
guestsRouter.put('/admin/invitations/:id/rsvp',requireAdmin,async(req,res)=>{
 const id=uuid.parse(req.params.id),{reason,expectedVersion,...data}=rsvpSchema.extend({reason:z.string().trim().min(1).max(500)}).parse(req.body);
 ok(res,await withTransaction(async tx=>{const found=await adminInvitation(tx,req,id);await lockEvent(tx,found.eventId);const inv=await adminInvitation(tx,req,id);if((inv.rsvp?.version??0)!==expectedVersion)throw conflict();const result=inv.rsvp?await tx.rSVP.update({where:{invitationId:id,version:expectedVersion},data:{...data,respondedAt:new Date(),version:{increment:1}}}):await tx.rSVP.create({data:{invitationId:id,...data}});await audit(tx,req,'ADMIN_RSVP_UPDATED',inv.eventId,'Invitation',id,{reason});return result;}));
});

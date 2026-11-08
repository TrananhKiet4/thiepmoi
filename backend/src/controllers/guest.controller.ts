import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Prisma} from '@prisma/client';
import {guestSchema,rsvpSchema,versionSchema} from '../../../packages/contracts/src/index.js';
import {withTransaction} from '../config/database.js';
import {config} from '../config/env.js';
import {AppError} from '../errors/app-error.js';
import {audit,ok,ownedEvent,pagination} from '../utils/http.js';
import {createInvitationToken,decryptInvitationToken,hashToken,retiredInvitationLinkHash} from '../utils/token.js';
import {conflict,lockEvent} from '../services/event.service.js';
import type {RequestHandler} from 'express';
import {uuid,include,safeGuest,guestFilter,adminGuest,adminInvitation,invitationLink} from '../services/guest.service.js';

export const getAdminEventsGuests:RequestHandler=async(req,res)=>{
 const eventId=uuid.parse(req.params.id),{page,pageSize,skip}=pagination(req);
 const sort=z.enum(['guestCode','fullName','createdAt','-guestCode','-fullName','-createdAt']).default('guestCode').parse(req.query.sort);
 ok(res,await withTransaction(async tx=>{await ownedEvent(req,eventId,tx);const where=guestFilter(req,eventId),[items,total]=await Promise.all([tx.guest.findMany({where,include,skip,take:pageSize,orderBy:[{[sort.replace(/^-/,'')]:sort.startsWith('-')?'desc':'asc'},{id:'asc'}]}),tx.guest.count({where})]);return {items:items.map(safeGuest),total,page,pageSize};}));
};
export const postAdminEventsGuests:RequestHandler=async(req,res)=>{
 const eventId=uuid.parse(req.params.id),{personalMessage,...data}=guestSchema.parse(req.body);
 ok(res,await withTransaction(async tx=>{await lockEvent(tx,eventId);await ownedEvent(req,eventId,tx);const id=randomUUID(),{token,...encrypted}=createInvitationToken(id);const guest=await tx.guest.create({data:{eventId,...data,invitation:{create:{id,eventId,personalMessage,...encrypted}}},include});await audit(tx,req,'GUEST_CREATED',eventId,'Guest',guest.id);return safeGuest(guest);}),201);
};
export const patchAdminGuests:RequestHandler=async(req,res)=>{
 const id=uuid.parse(req.params.id),{expectedVersion,expectedInvitationVersion,personalMessage,...data}=guestSchema.extend({expectedVersion:z.number().int().min(1),expectedInvitationVersion:z.number().int().min(1)}).parse(req.body);
 ok(res,await withTransaction(async tx=>{
  const found=await adminGuest(tx,req,id);await lockEvent(tx,found.eventId);const guest=await adminGuest(tx,req,id);
  if(guest.version!==expectedVersion||guest.invitation?.version!==expectedInvitationVersion)throw conflict();
  if(Object.entries(data).some(([k,v])=>guest[k as keyof typeof data]!==v))await tx.guest.update({where:{id,version:expectedVersion},data:{...data,version:{increment:1}}});
  if(guest.invitation.personalMessage!==personalMessage)await tx.invitation.update({where:{id:guest.invitation.id,version:expectedInvitationVersion},data:{personalMessage,version:{increment:1}}});
  await audit(tx,req,'GUEST_UPDATED',guest.eventId,'Guest',id);return safeGuest(await tx.guest.findUniqueOrThrow({where:{id},include}));
 }));
};
export function postAdminGuestsAction(action:'archive'|'restore'):RequestHandler{return async(req,res)=>{
 const id=uuid.parse(req.params.id),{expectedVersion}=versionSchema.parse(req.body);
 ok(res,await withTransaction(async tx=>{const found=await adminGuest(tx,req,id);await lockEvent(tx,found.eventId);const guest=await adminGuest(tx,req,id);if(guest.version!==expectedVersion)throw conflict();const updated=await tx.guest.update({where:{id,version:expectedVersion},data:{archivedAt:action==='archive'?new Date():null,version:{increment:1}},include});await audit(tx,req,`GUEST_${action.toUpperCase()}`,guest.eventId,'Guest',id);return safeGuest(updated);}));
};}
export const deleteAdminGuest:RequestHandler=async(req,res)=>{
 const id=uuid.parse(req.params.id),{expectedVersion}=versionSchema.parse(req.body);
 await withTransaction(async tx=>{
  const guest=await adminGuest(tx,req,id);
  await lockEvent(tx,guest.eventId);
  if(guest.version!==expectedVersion)throw conflict();
  await tx.$queryRaw`SELECT id FROM "Guest" WHERE id=${id}::uuid FOR UPDATE`;
  if(guest.invitation){
   const invitationId=guest.invitation.id;
   await tx.$queryRaw`SELECT id FROM "Invitation" WHERE id=${invitationId}::uuid FOR UPDATE`;
   const links=await tx.invitationLink.findMany({
    where:{invitationId},
    select:{slug:true,codeCiphertext:true,keyVersion:true},
   });
   if(links.length){
    // Retired reservations survive key rotation and never contain active credentials.
    const retired=links.map(link=>{
     if(link.keyVersion!==config.invitationKeyVersion&&!Object.hasOwn(config.invitationOldKeys,link.keyVersion)){
      throw new AppError(409,'LINK_KEY_REQUIRED','Cần khóa mã hóa cũ để xóa các link đã cấp cho khách này');
     }
     const code=decryptInvitationToken(invitationId,link.codeCiphertext,link.keyVersion);
     return {codeHash:retiredInvitationLinkHash(code,link.slug),tokenHash:'',slug:'',codeCiphertext:'',keyVersion:''};
    });
    await tx.invitationLink.createMany({data:retired,skipDuplicates:true});
    await tx.invitationLink.deleteMany({where:{invitationId}});
   }
   await tx.rSVP.deleteMany({where:{invitationId}});
   await tx.wish.deleteMany({where:{invitationId}});
   await tx.idempotencyRecord.deleteMany({where:{actorKeyHash:hashToken(invitationId),scope:{in:['guest.rsvp','guest.wish']}}});
   await tx.invitation.delete({where:{id:invitationId}});
  }
  await tx.guest.delete({where:{id,version:expectedVersion}});
  await audit(tx,req,'GUEST_DELETED',guest.eventId,'Guest',id);
 });
 res.status(204).end();
};
export const getAdminInvitationsLink:RequestHandler=async(req,res)=>{
 ok(res,await withTransaction(async tx=>{const inv=await adminInvitation(tx,req,uuid.parse(req.params.id)),url=await invitationLink(tx,inv,inv.guest.fullName);return {url,message:`Thân mời ${inv.guest.displayName||inv.guest.fullName} xem thiệp mời tốt nghiệp: ${url}`};}));
};
export function postAdminInvitationsAction(action:'revoke'|'rotate'):RequestHandler{return async(req,res)=>{
 const id=uuid.parse(req.params.id),{expectedVersion}=versionSchema.parse(req.body);
 ok(res,await withTransaction(async tx=>{const found=await adminInvitation(tx,req,id);await lockEvent(tx,found.eventId);const inv=await adminInvitation(tx,req,id);if(inv.version!==expectedVersion)throw conflict();
  let data:Prisma.InvitationUpdateInput={revokedAt:new Date(),version:{increment:1}};
  if(action==='rotate'){const {token,...encrypted}=createInvitationToken(id);data={...encrypted,revokedAt:null,version:{increment:1}};}
  const updated=await tx.invitation.update({where:{id,version:expectedVersion},data,select:{id:true,version:true,revokedAt:true}});await audit(tx,req,`INVITATION_${action.toUpperCase()}`,inv.eventId,'Invitation',id);return updated;
 }));
};}
export const putAdminInvitationsRsvp:RequestHandler=async(req,res)=>{
 const id=uuid.parse(req.params.id),{reason,expectedVersion,...data}=rsvpSchema.extend({reason:z.string().trim().min(1).max(500)}).parse(req.body);
 ok(res,await withTransaction(async tx=>{const found=await adminInvitation(tx,req,id);await lockEvent(tx,found.eventId);const inv=await adminInvitation(tx,req,id);if((inv.rsvp?.version??0)!==expectedVersion)throw conflict();const result=inv.rsvp?await tx.rSVP.update({where:{invitationId:id,version:expectedVersion},data:{...data,respondedAt:new Date(),version:{increment:1}}}):await tx.rSVP.create({data:{invitationId:id,...data}});await audit(tx,req,'ADMIN_RSVP_UPDATED',inv.eventId,'Invitation',id,{reason});return result;}));
};

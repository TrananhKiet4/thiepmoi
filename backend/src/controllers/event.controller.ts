import type {Prisma} from '@prisma/client';
import {z} from 'zod';
import {assetIds,contentSchema,publicationErrors,versionSchema} from '../../../packages/contracts/src/index.js';
import {withTransaction} from '../config/database.js';
import {AppError} from '../errors/app-error.js';
import {audit,ok,ownedEvent} from '../utils/http.js';
import {preparePublishedMedia} from '../services/media.service.js';
import type {RequestHandler} from 'express';
import {conflict,lockEvent,eventView,invitationView} from '../services/event.service.js';

export const getAdminEventsCurrent:RequestHandler=async(req,res)=>{
 ok(res,await withTransaction(async tx=>{const event=await tx.event.findFirst({where:{ownerId:req.admin!.id},orderBy:{createdAt:'desc'}});if(!event)throw new AppError(404,'NOT_FOUND','Chưa có sự kiện');return eventView(tx,event);}));
};
export const patchAdminEventsDraft:RequestHandler=async(req,res)=>{
 const id=z.string().uuid().parse(req.params.id),{content}=z.object({content:contentSchema}).strict().parse(req.body);
 const expected=z.string().regex(/^(?:[1-9]\d*|"[1-9]\d*")$/).transform(s=>Number(s.replaceAll('"',''))).pipe(z.number().int().safe()).parse(req.get('If-Match'));
 ok(res,await withTransaction(async tx=>{
  await lockEvent(tx,id);const event=await ownedEvent(req,id,tx);if(event.version!==expected)throw conflict();
  const ids=assetIds(content);if(await tx.mediaAsset.count({where:{eventId:id,id:{in:ids},status:'READY'}})!==ids.length)throw new AppError(422,'INVALID_MEDIA','Media thiếu hoặc không thuộc sự kiện');
  const previous=await tx.eventRevision.findFirst({where:{eventId:id},orderBy:{revisionNo:'desc'}});
  const revision=await tx.eventRevision.create({data:{eventId:id,revisionNo:(previous?.revisionNo??0)+1,contentJson:content as Prisma.InputJsonValue}});
  const updated=await tx.event.update({where:{id,version:expected},data:{draftRevisionId:revision.id,version:{increment:1}}});
  await audit(tx,req,'DRAFT_SAVED',id,'EventRevision',revision.id);return eventView(tx,updated);
 }));
};
export function postAdminEventsAction(action:'publish'|'unpublish'):RequestHandler{return async(req,res)=>{
 const id=z.string().uuid().parse(req.params.id),{expectedVersion}=versionSchema.parse(req.body);
 ok(res,await withTransaction(async tx=>{
  await lockEvent(tx,id);const event=await ownedEvent(req,id,tx);if(event.version!==expectedVersion)throw conflict();
  if(action==='publish'){
   const revision=await tx.eventRevision.findFirst({where:{id:event.draftRevisionId??'00000000-0000-0000-0000-000000000000',eventId:id}});
   if(!revision)throw new AppError(422,'DRAFT_REQUIRED','Vui lòng lưu bản nháp');
   const content=contentSchema.parse(revision.contentJson),fields=publicationErrors(content);if(Object.keys(fields).length)throw new AppError(422,'PUBLICATION_INVALID','Vui lòng hoàn thiện nội dung',fields);
   await preparePublishedMedia(id,content,tx);
  }
  const updated=await tx.event.update({where:{id,version:expectedVersion},data:{publishedRevisionId:action==='publish'?event.draftRevisionId:null,publishedAt:action==='publish'?new Date():null,version:{increment:1}}});
  await audit(tx,req,action.toUpperCase(),id,'Event',id);return eventView(tx,updated);
 }));
};}
export const patchAdminEventsControls:RequestHandler=async(req,res)=>{
 const id=z.string().uuid().parse(req.params.id),{expectedVersion,...controls}=z.object({expectedVersion:z.number().int().min(1),rsvpEnabled:z.boolean().optional(),wishesEnabled:z.boolean().optional(),wallEnabled:z.boolean().optional()}).strict().refine(b=>b.rsvpEnabled!==undefined||b.wishesEnabled!==undefined||b.wallEnabled!==undefined).parse(req.body);
 ok(res,await withTransaction(async tx=>{await lockEvent(tx,id);const event=await ownedEvent(req,id,tx);if(event.version!==expectedVersion)throw conflict();const updated=await tx.event.update({where:{id,version:expectedVersion},data:{...controls,version:{increment:1}}});await audit(tx,req,'CONTROLS_UPDATED',id,'Event',id,controls);return eventView(tx,updated);}));
};
export const getAdminEventsPreview:RequestHandler=async(req,res)=>{
 ok(res,await withTransaction(async tx=>{
  const event=await ownedEvent(req,String(req.params.id),tx),revision=event.draftRevisionId?await tx.eventRevision.findFirst({where:{id:event.draftRevisionId,eventId:event.id}}):null;
  if(!revision)throw new AppError(404,'DRAFT_REQUIRED','Chưa có bản nháp');
  const guestId=z.string().uuid().optional().parse(req.query.guestId),guest=guestId?await tx.guest.findFirst({where:{id:guestId,eventId:event.id},include:{invitation:{include:{rsvp:true,wish:true}}}}):null;
  if(guestId&&!guest)throw new AppError(404,'NOT_FOUND','Không tìm thấy khách');
  return invitationView(contentSchema.parse(revision.contentJson),event,guest??undefined,guest?.invitation??undefined,true);
 }));
};
export const getAdminEventsDashboard:RequestHandler=async(req,res)=>{
 ok(res,await withTransaction(async tx=>{
  const event=await ownedEvent(req,String(req.params.id),tx),where={eventId:event.id,revokedAt:null,guest:{archivedAt:null}};
  const [total,attending,declined,pendingWishes,opened]=await Promise.all([tx.invitation.count({where}),tx.invitation.count({where:{...where,rsvp:{status:'ATTENDING'}}}),tx.invitation.count({where:{...where,rsvp:{status:'DECLINED'}}}),tx.wish.count({where:{deletedAt:null,consentPublic:true,moderationStatus:'PENDING',invitation:where}}),tx.invitation.count({where:{...where,openedAt:{not:null}}})]);
  return {total,attending,declined,unanswered:total-attending-declined,pendingWishes,opened};
 }));
};

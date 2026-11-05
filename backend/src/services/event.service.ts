import type {Event,Guest,Invitation,RSVP,Wish} from '@prisma/client';
import {type Content} from '../../../packages/contracts/src/index.js';
import {prisma,type Tx} from '../config/database.js';
import {AppError} from '../errors/app-error.js';
import {canWrite,personalize} from '../utils/invitation.js';
import {mediaUrls} from './media.service.js';

export const conflict=()=>new AppError(409,'VERSION_CONFLICT','Dữ liệu đã thay đổi, vui lòng tải lại');
export function rsvpView(r:RSVP|null|undefined){return r?{id:r.id,status:r.status,note:r.note,version:r.version,respondedAt:r.respondedAt,updatedAt:r.updatedAt}:null;}
export function wishView(w:Wish|null|undefined){return w?{id:w.id,body:w.body,consentPublic:w.consentPublic,moderationStatus:w.moderationStatus,isPinned:w.isPinned,approvedAt:w.approvedAt,deletedAt:w.deletedAt,version:w.version,createdAt:w.createdAt,updatedAt:w.updatedAt}:null;}
export async function lockEvent(tx:Tx,id:string){await tx.$queryRaw`SELECT id FROM "Event" WHERE id=${id}::uuid FOR UPDATE`;}
export async function eventView(tx:Tx,event:Event){
 const revisions=await tx.eventRevision.findMany({where:{eventId:event.id,id:{in:[event.draftRevisionId,event.publishedRevisionId].filter((id):id is string=>!!id)}}});
 return {id:event.id,version:event.version,draftRevisionId:event.draftRevisionId,publishedRevisionId:event.publishedRevisionId,publishedAt:event.publishedAt,rsvpEnabled:event.rsvpEnabled,wishesEnabled:event.wishesEnabled,wallEnabled:event.wallEnabled,draft:revisions.find(r=>r.id===event.draftRevisionId)??null,published:revisions.find(r=>r.id===event.publishedRevisionId)??null};
}
export async function invitationView(content:Content,event:Event,guest?:Guest,invitation?:Invitation&{rsvp?:RSVP|null;wish?:Wish|null},preview=false,tx:Tx|typeof prisma=prisma){
 const displayName=guest?.displayName||guest?.fullName||'Khách xem trước';
 const opening=content.sections.find(s=>s.type==='opening');
 const template=invitation?.personalMessage||content.groupMessages[guest?.groupKey??'']||(opening?.type==='opening'?opening.data.messageTemplate:'');
 return {content,media:await mediaUrls(content,preview,tx),guest:{displayName,fullName:guest?.fullName??displayName,salutation:guest?.salutation??'bạn'},personalMessage:personalize(template,{guestName:displayName,hostName:content.host.fullName,salutation:guest?.salutation??'bạn'}),rsvp:rsvpView(invitation?.rsvp),wish:wishView(invitation?.wish),canRsvp:!preview&&canWrite(event.rsvpEnabled,content.rsvpDeadline),canCreateOrEditWish:!preview&&canWrite(event.wishesEnabled,content.wishDeadline),canWithdrawWish:!preview&&!!invitation?.wish&&!invitation.wish.deletedAt,eventId:event.id,...(preview?{preview:true}:{})};
}

import type {Event,Guest,Invitation,Prisma,RSVP,Wish} from '@prisma/client';
import {type Content} from '../../../packages/contracts/src/index.js';
import {prisma,type Tx} from '../config/database.js';
import {AppError} from '../errors/app-error.js';
import {canWrite,personalize} from '../utils/invitation.js';
import {mediaUrls} from './media.service.js';

export const conflict=()=>new AppError(409,'VERSION_CONFLICT','Dữ liệu đã thay đổi, vui lòng tải lại');
export function rsvpView(r:RSVP|null|undefined){return r?{id:r.id,status:r.status,note:r.note,version:r.version,respondedAt:r.respondedAt,updatedAt:r.updatedAt}:null;}
export function wishView(w:Wish|null|undefined){return w?{id:w.id,body:w.body,consentPublic:w.consentPublic,consentAttendancePublic:w.consentAttendancePublic,moderationStatus:w.moderationStatus,isPinned:w.isPinned,approvedAt:w.approvedAt,deletedAt:w.deletedAt,version:w.version,createdAt:w.createdAt,updatedAt:w.updatedAt}:null;}
export async function lockEvent(tx:Tx,id:string){await tx.$queryRaw`SELECT id FROM "Event" WHERE id=${id}::uuid FOR UPDATE`;}
export async function eventView(tx:Tx,event:Event){
 const revisions=await tx.eventRevision.findMany({where:{eventId:event.id,id:{in:[event.draftRevisionId,event.publishedRevisionId].filter((id):id is string=>!!id)}}});
 return {id:event.id,version:event.version,draftRevisionId:event.draftRevisionId,publishedRevisionId:event.publishedRevisionId,publishedAt:event.publishedAt,rsvpEnabled:event.rsvpEnabled,wishesEnabled:event.wishesEnabled,wallEnabled:event.wallEnabled,draft:revisions.find(r=>r.id===event.draftRevisionId)??null,published:revisions.find(r=>r.id===event.publishedRevisionId)??null};
}
export async function readPublicWishes(tx:Tx,eventId:string,limit:number,after?:{p:boolean;a:string;id:string},excludeInvitationId?:string){
 const where:Prisma.WishWhereInput={
  consentPublic:true,moderationStatus:'APPROVED',deletedAt:null,approvedAt:{not:null},
  ...(excludeInvitationId?{invitationId:{not:excludeInvitationId}}:{}),
  invitation:{eventId,revokedAt:null,guest:{archivedAt:null}},
 };
 if(after){
  const date=new Date(after.a);
  where.OR=[...(after.p?[{isPinned:false}]:[]),{isPinned:after.p,approvedAt:{lt:date}},{isPinned:after.p,approvedAt:date,id:{lt:after.id}}];
 }
 const rows=await tx.wish.findMany({
  where,orderBy:[{isPinned:'desc'},{approvedAt:'desc'},{id:'desc'}],take:limit+1,
  select:{id:true,body:true,approvedAt:true,isPinned:true,consentAttendancePublic:true,invitation:{select:{guest:{select:{displayName:true,fullName:true}},rsvp:{select:{status:true}}}}},
 });
 const items=rows.slice(0,limit).map(wish=>{
  const status=wish.invitation.rsvp?.status;
  return {
   id:wish.id,displayName:wish.invitation.guest.displayName||wish.invitation.guest.fullName,
   body:wish.body,approvedAt:wish.approvedAt,isPinned:wish.isPinned,
   attendanceStatus:wish.consentAttendancePublic&&(status==='ATTENDING'||status==='DECLINED')?status:null,
  };
 });
 const last=items.at(-1);
 return {items,nextCursor:rows.length>limit&&last?Buffer.from(JSON.stringify({p:last.isPinned,a:last.approvedAt!.toISOString(),id:last.id})).toString('base64url'):null};
}
export async function invitationView(content:Content,event:Event,guest?:Guest,invitation?:Invitation&{rsvp?:RSVP|null;wish?:Wish|null},preview=false,tx:Tx=prisma){
 const displayName=guest?.displayName||guest?.fullName||'Khách xem trước';
 const opening=content.sections.find(s=>s.type==='opening');
 const template=invitation?.personalMessage||content.groupMessages[guest?.groupKey??'']||(opening?.type==='opening'?opening.data.messageTemplate:'');
 const previewWishes=preview&&event.wallEnabled?(await readPublicWishes(tx,event.id,6,undefined,invitation?.id)).items:undefined;
 return {content,media:mediaUrls(content),guest:{displayName,fullName:guest?.fullName??displayName,salutation:guest?.salutation??'bạn'},personalMessage:personalize(template,{guestName:displayName,hostName:content.host.fullName,salutation:guest?.salutation??'bạn'}),rsvp:rsvpView(invitation?.rsvp),wish:wishView(invitation?.wish),canRsvp:!preview&&canWrite(event.rsvpEnabled,content.rsvpDeadline),canCreateOrEditWish:!preview&&canWrite(event.wishesEnabled,content.wishDeadline),canWithdrawWish:!preview&&!!invitation?.wish&&!invitation.wish.deletedAt,eventId:event.id,wallEnabled:event.wallEnabled,...(preview?{preview:true,previewWishes}:{})};
}

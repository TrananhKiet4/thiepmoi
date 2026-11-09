import type {Event,Guest,Invitation,Prisma,RSVP,Wish} from '@prisma/client';
import {type Content} from '../../../packages/contracts/src/index.js';
import {prisma,type Tx} from '../config/database.js';
import {AppError} from '../errors/app-error.js';
import {canWrite,personalize} from '../utils/invitation.js';
import {mediaUrls} from './media.service.js';

export const conflict=()=>new AppError(409,'VERSION_CONFLICT','Dữ liệu đã thay đổi, vui lòng tải lại');
const standardOpening='Thân mời {{guestName}} đến chung vui trong lễ tốt nghiệp của mình. Mình rất mong được gặp bạn và chụp cùng nhau một tấm ảnh để nhớ ngày này.';
const sentenceCase=(word:string)=>word.charAt(0).toLocaleUpperCase('vi')+word.slice(1);
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
  invitation:{eventId,revokedAt:null,guest:{archivedAt:null},OR:[{familyParentId:null},{familyParent:{revokedAt:null,guest:{archivedAt:null}}}]},
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
export async function invitationView(content:Content,event:Event,guest?:Guest,invitation?:Invitation&{rsvp?:RSVP|null;wish?:Wish|null;familyParent?:Invitation&{guest:Guest}|null},preview=false,tx:Tx=prisma){
 const card=invitation?.familyParent??invitation;
 const responderName=invitation?.familyParent?(guest?.displayName||guest?.fullName):undefined;
 guest=invitation?.familyParent?.guest??guest;
 const displayName=guest?.displayName||guest?.fullName||'Khách xem trước';
 const family=guest?.groupKey==='gia_dinh';
 const salutation=guest?.salutation.normalize('NFC').trim().toLocaleLowerCase('vi').replace(/\s+/gu,' ')??'';
 const normalizedName=displayName.normalize('NFC').trim().replace(/\s+/gu,' ');
 const recipientName=salutation&&normalizedName.toLocaleLowerCase('vi').startsWith(salutation+' ')
  ?normalizedName.slice(salutation.length+1):displayName;
 const aunt=/^thím(?:\s|$)/iu.test(salutation||displayName);
 const senior=/^(anh|chị)(?:\s|$)/u.test(salutation);
 const junior=/^em(?:\s|$)/u.test(salutation);
 const address=salutation||(family?'đại gia đình':aunt?displayName:'bạn');
 const recipientAddress=address==='đại gia đình'?'cả nhà':address;
 const headingAddress=recipientAddress.replace(/^(anh|chị) hai$/u,'$1');
 const recipientGreeting=family?'Thương gửi':/^(bạn|em)(?:\s|$)/u.test(salutation)?'Thân gửi':'Kính gửi';
 const openingVars={guestName:recipientName,hostName:content.host.fullName,salutation:guest?.salutation??'bạn',
  recipientAddress:address,headingAddress,HeadingAddress:sentenceCase(headingAddress)};
 const opening=content.sections.find(s=>s.type==='opening');
 const customOpening=card?.personalMessage||content.groupMessages[guest?.groupKey??''];
 const sharedOpening=opening?.data.messageTemplate??'';
 const invite=family?'Thương mời':senior||aunt?'Kính mời':'Thân mời';
 const speaker=salutation==='em yêu'?'anh':family||aunt?'con':senior?'em':junior?'anh':'mình';
 const sentenceSpeaker=sentenceCase(speaker);
 const vars={...openingVars,speaker,Speaker:sentenceSpeaker,invitationGreeting:invite};
 const usePronouns=(text:string,recipient=address)=>text.replace(/(?<![\p{L}\p{M}])(?:bạn(?!\s+bè(?![\p{L}\p{M}]))|mình)(?![\p{L}\p{M}])/giu,word=>{
  const lower=word.toLocaleLowerCase('vi'),replacement=lower==='bạn'?recipient:speaker;
  return word===lower?replacement:sentenceCase(replacement);
 });
 const openingMessage=!customOpening&&sharedOpening===standardOpening
  ?`${invite} ${recipientName} đến chung vui trong lễ tốt nghiệp của ${speaker}. ${sentenceSpeaker} rất mong được gặp ${address} và chụp cùng nhau một tấm ảnh để nhớ ngày này.`
  :personalize(customOpening||sharedOpening,vars);
 const sections=content.sections.map(section=>{
  if(section.type==='opening'&&section.data.title==='Một lời mời dành riêng cho bạn'){
   return {...section,data:{...section.data,title:'MỘT LỜI MỜI DÀNH RIÊNG CHO'}};
  }
  if(section.type==='response')return {...section,data:{...section.data,title:personalize(usePronouns(section.data.title,recipientAddress),vars),wishIntro:personalize(usePronouns(section.data.wishIntro),vars),...(section.data.wishTitle?{wishTitle:personalize(section.data.wishTitle,vars)}:{})}};
  if(section.type==='closing')return {...section,data:{message:personalize(usePronouns(section.data.message),vars),attendingMessage:personalize(usePronouns(section.data.attendingMessage),vars),declinedMessage:personalize(usePronouns(section.data.declinedMessage),vars)}};
  if(section.type!=='invitation')return section;
  const lead=/^\s*(?:mình\s+)?trân trọng mời bạn(?=\s|[.,!]|$)/iu;
  let message=card?.letterMessage||section.data.message;
  if(!card?.letterMessage&&lead.test(message))message=`Trân trọng mời ${address} đến chụp hình và lưu giữ những kỷ niệm trong ngày tốt nghiệp của ${speaker}.`;
  const letterVars={...vars,salutation:address};
  const standardTitle=section.data.title.toLocaleLowerCase('vi')==='hẹn bạn trong ngày đặc biệt';
  const title=card?.letterTitle?personalize(card.letterTitle,letterVars):standardTitle?`Hẹn ${headingAddress} trong ngày đặc biệt`:personalize(section.data.title,letterVars);
  return {...section,data:{title,message:personalize(message,letterVars)}};
 });
 const previewWishes=preview&&event.wallEnabled?(await readPublicWishes(tx,event.id,6,undefined,invitation?.id)).items:undefined;
 const shared=!!invitation?.allowMultipleResponses;
 const canRsvp=!preview&&canWrite(event.rsvpEnabled,content.rsvpDeadline);
 const canWish=!preview&&canWrite(event.wishesEnabled,content.wishDeadline);
 return {content:{...content,sections},media:mediaUrls(content),guest:{displayName,recipientName,fullName:guest?.fullName??displayName,salutation:guest?.salutation??'',recipientGreeting,recipientAddress},personalMessage:openingMessage,rsvp:shared?null:rsvpView(invitation?.rsvp),wish:shared?null:wishView(invitation?.wish),canRsvp:!shared&&canRsvp,canCreateOrEditWish:!shared&&canWish,canWithdrawWish:!shared&&!preview&&!!invitation?.wish&&!invitation.wish.deletedAt,eventId:event.id,wallEnabled:event.wallEnabled,...(shared?{familyReply:{canRegister:canRsvp||canWish}}:{}),...(responderName?{responderName}:{}),...(preview?{preview:true,previewWishes}:{})};
}

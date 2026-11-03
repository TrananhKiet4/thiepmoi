import {type Request} from 'express';
import {z} from 'zod';
import type {Prisma} from '@prisma/client';
import {type Tx} from '../config/database.js';
import {AppError} from '../errors/app-error.js';
import {ownedEvent} from '../utils/http.js';

export const uuid=z.string().uuid();
export const include={invitation:{include:{rsvp:true,wish:true}}} as const;
export function safeGuest(guest:Prisma.GuestGetPayload<{include:typeof include}>){
 const {invitation,...fields}=guest;
 return {...fields,personalMessage:invitation?.personalMessage??'',invitation:invitation?{id:invitation.id,version:invitation.version,personalMessage:invitation.personalMessage,revokedAt:invitation.revokedAt,openedAt:invitation.openedAt,lastOpenedAt:invitation.lastOpenedAt,rsvp:invitation.rsvp,wish:invitation.wish}:null};
}
export function guestFilter(req:Pick<Request,'query'>,eventId:string):Prisma.GuestWhereInput{
 const q=z.object({q:z.string().trim().max(120).optional(),group:z.string().max(60).optional(),status:z.preprocess(v=>v===''?undefined:v,z.enum(['ATTENDING','DECLINED','UNANSWERED']).optional()),archived:z.enum(['true','false','all']).default('false')}).parse(req.query);
 return {eventId,...(q.archived==='all'?{}:{archivedAt:q.archived==='true'?{not:null}:null}),...(q.group?{groupKey:q.group}:{}),...(q.q?{OR:[{fullName:{contains:q.q,mode:'insensitive'}},{displayName:{contains:q.q,mode:'insensitive'}},{guestCode:{contains:q.q,mode:'insensitive'}}]}:{}),...(q.status?{invitation:q.status==='UNANSWERED'?{rsvp:{is:null}}:{rsvp:{status:q.status}}}:{})};
}
export async function adminGuest(tx:Tx,req:Request,id:string){const guest=await tx.guest.findUnique({where:{id},include});if(!guest)throw new AppError(404,'NOT_FOUND','Không tìm thấy khách');await ownedEvent(req,guest.eventId,tx);return guest;}
export async function adminInvitation(tx:Tx,req:Request,id:string){const invitation=await tx.invitation.findUnique({where:{id},include:{guest:true,rsvp:true}});if(!invitation)throw new AppError(404,'NOT_FOUND','Không tìm thấy thiệp');await ownedEvent(req,invitation.eventId,tx);return invitation;}

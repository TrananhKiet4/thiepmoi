import type {RequestHandler} from 'express';
import {rateLimit} from 'express-rate-limit';
import {timingSafeEqual} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import {prisma} from '../config/database.js';
import {config} from '../config/env.js';
import {hashToken,parseShortCredential,invitationLinkHashes} from '../utils/token.js';
import {AppError} from '../errors/app-error.js';
import {rateLimitStore} from './rate-limit.store.js';

export const safeEqual=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export const checkOrigin:RequestHandler=(req,_res,next)=>{if(!['GET','HEAD','OPTIONS'].includes(req.method)){const origin=req.get('Origin');if(!origin||!config.corsOrigins.includes(origin))return next(new AppError(403,'ORIGIN_FORBIDDEN','Nguồn yêu cầu không hợp lệ'));}next();};
export const requireAdmin:RequestHandler=async(req,_res,next)=>{
 const token=req.signedCookies?.sid;
 if(!token||typeof token!=='string')throw new AppError(401,'AUTH_REQUIRED','Vui lòng đăng nhập');
 const s=await prisma.adminSession.findUnique({where:{sessionHash:hashToken(token)},include:{admin:true}});
 if(!s||s.revokedAt||s.expiresAt<=new Date()||s.admin.disabledAt)throw new AppError(401,'AUTH_REQUIRED','Phiên đăng nhập đã hết hạn');
 req.admin={id:s.admin.id,email:s.admin.email,csrfToken:s.csrfToken,sessionId:s.id};
 if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!safeEqual(req.get('X-CSRF-Token')??'',s.csrfToken))throw new AppError(403,'CSRF_INVALID','Phiên xác nhận không hợp lệ, hãy tải lại trang');
 next();
};
export const guestReadLimiter=rateLimit({store:rateLimitStore('guest-read'),windowMs:60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false,skip:()=>process.env.NODE_ENV==='test',message:{error:{code:'RATE_LIMITED',message:'Vui lòng thử lại sau'}}});
export const guestWriteLimiter=rateLimit({store:rateLimitStore('guest-write'),windowMs:60000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,keyGenerator:req=>hashToken((req.get('Authorization')??'')+'|'+req.ip),skip:req=>process.env.NODE_ENV==='test'||['GET','HEAD'].includes(req.method),validate:{keyGeneratorIpFallback:false},message:{error:{code:'RATE_LIMITED',message:'Bạn gửi quá nhanh, vui lòng chờ'}}});
export const requireGuest:RequestHandler=async(req,res,next)=>{
 const header=req.get('Authorization')??'';
 const short=header.startsWith('Bearer ')?parseShortCredential(header.slice(7)):null;
 const select={id:true,eventId:true,tokenHash:true,revokedAt:true,guest:{select:{archivedAt:true}},event:{select:{publishedRevisionId:true}}} as const;
 let inv:Prisma.InvitationGetPayload<{select:typeof select}>|null=null;
 if(short){
  // ReadCommitted sees the latest failure budget after waiting for the name lock.
  const result=await prisma.$transaction(async tx=>{
   const limited=process.env.NODE_ENV!=='test',key='short-link-failures:'+hashToken(short[2]);
   if(limited){
    await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`;
   }
   const now=new Date(),bucket=limited?await tx.rateLimitBucket.findUnique({where:{key}}):null,unexpired=bucket&&bucket.expiresAt>now;
   if(unexpired&&bucket.hits>=5)return {inv:null,retryAfter:Math.max(1,Math.ceil((bucket.expiresAt.getTime()-now.getTime())/1000))};
   const links=await tx.invitationLink.findMany({where:{codeHash:{in:invitationLinkHashes(short[1],short[2])}},select:{tokenHash:true,restoredTokenHash:true,invitation:{select}},take:2});
   const link=links.length===1?links[0]:null;
   const candidate=link?.invitation&&(link.tokenHash===link.invitation.tokenHash||link.restoredTokenHash===link.invitation.tokenHash)?link.invitation:null;
   if(!candidate&&limited){const expiresAt=unexpired?bucket.expiresAt:new Date(now.getTime()+900000),hits=unexpired?bucket.hits+1:1;await tx.rateLimitBucket.upsert({where:{key},create:{key,hits,expiresAt},update:{hits,expiresAt}});}
   return {inv:candidate,retryAfter:0};
  },{isolationLevel:'ReadCommitted',maxWait:3000,timeout:8000});
  if(result.retryAfter){res.set('Retry-After',String(result.retryAfter));throw new AppError(429,'SHORT_LINK_LIMIT','Quá nhiều lần thử mã cho tên này, hãy thử lại sau 15 phút');}
  inv=result.inv;
 }else if(/^Bearer [A-Za-z0-9_-]{43}$/.test(header))inv=await prisma.invitation.findUnique({where:{tokenHash:hashToken(header.slice(7))},select});
 else throw new AppError(401,'TOKEN_INVALID','Link mời không hợp lệ');
 if(!inv)throw new AppError(401,'TOKEN_INVALID','Thiệp không khả dụng');
 if(inv.revokedAt||inv.guest.archivedAt)throw new AppError(404,'INVITATION_NOT_AVAILABLE','Thiệp không khả dụng');
 if(!inv.event.publishedRevisionId)throw new AppError(404,'EVENT_NOT_AVAILABLE','Thiệp chưa sẵn sàng');
 req.invitation={id:inv.id,eventId:inv.eventId,tokenHash:inv.tokenHash};next();
};
export const guestLimiters=[guestReadLimiter,guestWriteLimiter];

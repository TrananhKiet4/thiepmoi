import {type RequestHandler} from 'express';
import {rateLimit} from 'express-rate-limit';
import {timingSafeEqual} from 'node:crypto';
import {prisma} from '../config/database.js';
import {config} from '../config/env.js';
import {hashToken} from '../utils/token.js';
import {AppError} from '../errors/app-error.js';
import {BoundedMemoryStore} from './rate-limit.store.js';

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
export const guestReadLimiter=rateLimit({store:new BoundedMemoryStore(),windowMs:60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false,skip:()=>process.env.NODE_ENV==='test',message:{error:{code:'RATE_LIMITED',message:'Vui lòng thử lại sau'}}});
export const guestWriteLimiter=rateLimit({store:new BoundedMemoryStore(),windowMs:60000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,keyGenerator:req=>hashToken((req.get('Authorization')??'')+'|'+req.ip),skip:req=>process.env.NODE_ENV==='test'||['GET','HEAD'].includes(req.method),validate:{keyGeneratorIpFallback:false},message:{error:{code:'RATE_LIMITED',message:'Bạn gửi quá nhanh, vui lòng chờ'}}});
export const requireGuest:RequestHandler=async(req,_res,next)=>{
 const header=req.get('Authorization')??'';
 if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(header))throw new AppError(401,'TOKEN_INVALID','Link mời không hợp lệ');
 const inv=await prisma.invitation.findUnique({where:{tokenHash:hashToken(header.slice(7))},include:{guest:true,event:true,rsvp:true,wish:true}});
 if(!inv)throw new AppError(401,'TOKEN_INVALID','Thiệp không khả dụng');
 if(inv.revokedAt||inv.guest.archivedAt)throw new AppError(404,'INVITATION_NOT_AVAILABLE','Thiệp không khả dụng');
 if(!inv.event.publishedRevisionId)throw new AppError(404,'EVENT_NOT_AVAILABLE','Thiệp chưa sẵn sàng');
 req.invitation=inv;next();
};
export const guestLimiters=[guestReadLimiter,guestWriteLimiter];

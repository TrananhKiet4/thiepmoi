import {type RequestHandler} from 'express';
import {randomBytes} from 'node:crypto';
import {verify,hash} from '@node-rs/argon2';
import {z} from 'zod';
import {prisma} from '../config/database.js';
import {config} from '../config/env.js';
import {hashToken} from '../utils/token.js';
import {AppError} from '../errors/app-error.js';
import {ok} from '../utils/http.js';

let dummyHash:Promise<string>|undefined;
export const postAdminAuthLogin:RequestHandler=async(req,res)=>{
 const input=z.object({email:z.string().trim().email().max(254).transform(s=>s.toLowerCase()),password:z.string().min(1).max(200)}).strict().parse(req.body);
 const admin=await prisma.adminUser.findUnique({where:{email:input.email}});
 dummyHash??=hash(randomBytes(32).toString('hex'));const match=await verify(admin?.passwordHash??await dummyHash,input.password);
 if(!admin||admin.disabledAt||!match)throw new AppError(401,'LOGIN_INVALID','Email hoặc mật khẩu không đúng');
 const token=randomBytes(32).toString('base64url'),csrfToken=randomBytes(32).toString('base64url');
 const session=await prisma.adminSession.create({data:{adminId:admin.id,sessionHash:hashToken(token),csrfToken,expiresAt:new Date(Date.now()+43200000)}});
 res.cookie('sid',token,{signed:true,httpOnly:true,secure:config.production,sameSite:'lax',path:'/',maxAge:43200000});
 ok(res,{id:admin.id,email:admin.email,csrfToken,expiresAt:session.expiresAt});
};
export const getAdminAuthMe:RequestHandler=(req,res)=>ok(res,{id:req.admin!.id,email:req.admin!.email,csrfToken:req.admin!.csrfToken});
export const postAdminAuthLogout:RequestHandler=async(req,res)=>{await prisma.adminSession.update({where:{id:req.admin!.sessionId},data:{revokedAt:new Date()}});res.clearCookie('sid',{httpOnly:true,secure:config.production,sameSite:'lax',path:'/'});res.status(204).end();};

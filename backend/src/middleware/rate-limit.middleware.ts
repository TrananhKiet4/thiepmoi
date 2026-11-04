import {rateLimit} from 'express-rate-limit';
import {hashToken} from '../utils/token.js';
import {rateLimitStore} from './rate-limit.store.js';

export const loginOptions={windowMs:900000,limit:5,skipSuccessfulRequests:true,standardHeaders:'draft-8' as const,legacyHeaders:false,skip:()=>process.env.NODE_ENV==='test',message:{error:{code:'LOGIN_LIMIT',message:'Quá nhiều lần đăng nhập, hãy thử lại sau 15 phút'}}};
export const loginIpLimit=rateLimit({...loginOptions,store:rateLimitStore('login-ip')});
export const loginAccountLimit=rateLimit({...loginOptions,store:rateLimitStore('login-account'),keyGenerator:req=>hashToken(String(req.body?.email??'').trim().toLowerCase())});

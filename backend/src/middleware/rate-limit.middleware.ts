import {rateLimit} from 'express-rate-limit';
import {hashToken} from '../utils/token.js';
import {BoundedMemoryStore} from './rate-limit.store.js';

export const loginOptions={windowMs:900000,limit:5,skipSuccessfulRequests:true,standardHeaders:'draft-8' as const,legacyHeaders:false,skip:()=>process.env.NODE_ENV==='test',message:{error:{code:'LOGIN_LIMIT',message:'Quá nhiều lần đăng nhập, hãy thử lại sau 15 phút'}}};
export const loginIpLimit=rateLimit({...loginOptions,store:new BoundedMemoryStore()});
export const loginAccountLimit=rateLimit({...loginOptions,store:new BoundedMemoryStore(),keyGenerator:req=>hashToken(String(req.body?.email??'').trim().toLowerCase())});

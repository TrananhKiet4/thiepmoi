import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {ZodError} from 'zod';
import {Prisma} from '@prisma/client';
import multer from 'multer';
import {config} from './config.js';
import {prisma} from './db.js';
import {AppError} from './http.js';
import {authRouter,checkOrigin,guestLimiters} from './auth.js';
import {eventsRouter} from './events.js';
import {guestsRouter} from './guests.js';
import {guestRouter,wishesAdminRouter} from './responses.js';
import {importRouter} from './imports.js';
import {mediaRouter} from './media.js';
export function createApp(){
 const app=express();app.disable('x-powered-by');app.set('trust proxy',config.trustProxy);
 const mediaOrigin=config.publicMediaBaseUrl?new URL(config.publicMediaBaseUrl).origin:null;
 app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:',...(mediaOrigin?[mediaOrigin]:[])],mediaSrc:["'self'",...(mediaOrigin?[mediaOrigin]:[])],frameSrc:['https://www.google.com'],connectSrc:["'self'"],upgradeInsecureRequests:config.production?[]:null}},strictTransportSecurity:config.production?{maxAge:31536000,includeSubDomains:true}:false,referrerPolicy:{policy:'no-referrer'}}));
 app.use((req,res,next)=>{req.requestId=randomUUID();res.setHeader('X-Request-ID',req.requestId);res.setHeader('X-Robots-Tag','noindex, nofollow');next();});
 app.use(express.json({limit:'100kb'}));app.use(cookieParser(config.sessionSecret));
 app.get('/health/live',(_req,res)=>res.json({ok:true}));
 app.get('/health/ready',async(_req,res)=>{try{await prisma.$queryRaw`SELECT 1`;res.json({ok:true});}catch{res.status(503).json({ok:false});}});
 app.use('/api/v1',(req,res,next)=>{res.setHeader('Cache-Control','private, no-store');if(req.path.startsWith('/admin'))return checkOrigin(req,res,next);next();});
 app.use('/api/v1/guest',...guestLimiters);
 app.use('/api/v1',authRouter,eventsRouter,guestsRouter,guestRouter,wishesAdminRouter,importRouter,mediaRouter);
 app.use('/api',(_req,_res,next)=>next(new AppError(404,'NOT_FOUND','API không tồn tại')));
 if(config.production){const web=resolve('apps/web/dist');app.use(express.static(web,{index:false}));app.get(['/','/admin','/admin/*path','/i/:token'],(_req,res)=>res.sendFile(resolve(web,'index.html')));}
 app.use((_req,_res,next)=>next(new AppError(404,'NOT_FOUND','Không tìm thấy trang')));
 app.use((error:any,req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  let status=500,code='INTERNAL_ERROR',message='Có lỗi xảy ra, vui lòng thử lại',fields:Record<string,string>|undefined;
  if(error instanceof AppError){({status,code,message,fields}=error);}
  else if(error instanceof ZodError){status=400;code='VALIDATION_ERROR';message='Dữ liệu không hợp lệ';fields=Object.fromEntries(error.issues.map(i=>[i.path.join('.'),i.message]));}
  else if(error instanceof Prisma.PrismaClientKnownRequestError){if(['P2002','P2034','P2003'].includes(error.code)){status=409;code='CONFLICT';message='Dữ liệu đã thay đổi hoặc bị trùng, vui lòng tải lại';}else if(error.code==='P2025'){status=404;code='NOT_FOUND';message='Không tìm thấy dữ liệu';}}
  else if(error instanceof multer.MulterError){status=400;code='UPLOAD_INVALID';message='File không hợp lệ hoặc vượt quá giới hạn';}
  else if(error?.type==='entity.too.large'){status=413;code='BODY_TOO_LARGE';message='Dữ liệu quá lớn';}
  else if(error instanceof SyntaxError&&'body' in error){status=400;code='JSON_INVALID';message='JSON không hợp lệ';}
  if(status>=500)console.error(JSON.stringify({requestId:req.requestId,code}));
  res.status(status).json({error:{code,message,...(fields?{fields}:{}),requestId:req.requestId}});
 });return app;
}

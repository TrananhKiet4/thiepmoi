import {errorHandler} from './middleware/error.middleware.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {config} from './config/env.js';
import {prisma} from './config/database.js';
import {AppError} from './errors/app-error.js';
import {authRouter} from './routes/auth.route.js';
import {checkOrigin,guestLimiters} from './middleware/auth.middleware.js';
import {eventsRouter} from './routes/event.route.js';
import {guestsRouter} from './routes/guest.route.js';
import {guestRouter,wishesAdminRouter} from './routes/response.route.js';
import {importRouter} from './routes/import.route.js';
import {mediaRouter} from './routes/media.route.js';
import {uploadRouter} from './routes/upload.route.js';
import {maintenanceRouter} from './routes/maintenance.route.js';

export function createApp(){
 const app=express();app.disable('x-powered-by');app.set('trust proxy',config.trustProxy);
 const mediaOrigin=config.publicMediaBaseUrl?new URL(config.publicMediaBaseUrl).origin:null;
 const storageOrigin=config.storageDriver==='s3'&&config.storageEndpoint?new URL(config.storageEndpoint).origin:null,mediaOrigins=[...new Set([mediaOrigin,storageOrigin].filter((value):value is string=>!!value))];
 app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:',...mediaOrigins],mediaSrc:["'self'",...mediaOrigins],frameSrc:['https://www.google.com'],connectSrc:["'self'",...(storageOrigin?[storageOrigin]:[])],upgradeInsecureRequests:config.production?[]:null}},strictTransportSecurity:config.production?{maxAge:31536000,includeSubDomains:true}:false,referrerPolicy:{policy:'no-referrer'}}));
 app.use((req,res,next)=>{req.requestId=randomUUID();res.setHeader('X-Request-ID',req.requestId);res.setHeader('X-Robots-Tag','noindex, nofollow');next();});
 app.use(express.json({limit:'100kb'}));app.use(cookieParser(config.sessionSecret));
 app.get('/health/live',(_req,res)=>res.json({ok:true}));
 app.get('/health/ready',async(_req,res)=>{try{await prisma.$queryRaw`SELECT 1`;res.json({ok:true});}catch{res.status(503).json({ok:false});}});
 app.use('/api/v1',(req,res,next)=>{res.setHeader('Cache-Control','private, no-store');if(req.path.startsWith('/admin'))return checkOrigin(req,res,next);next();});
 app.use('/api/v1/guest',...guestLimiters);
 app.use('/api/v1',authRouter,eventsRouter,guestsRouter,guestRouter,wishesAdminRouter,importRouter,mediaRouter,uploadRouter);
 app.use(maintenanceRouter);
 app.use('/api',(_req,_res,next)=>next(new AppError(404,'NOT_FOUND','API không tồn tại')));
 if(config.production){const web=resolve('frontend/dist');app.use(express.static(web,{index:false}));app.get(['/','/admin','/admin/*path','/i/:token'],(_req,res)=>res.sendFile(resolve(web,'index.html')));}
 app.use((_req,_res,next)=>next(new AppError(404,'NOT_FOUND','Không tìm thấy trang')));
 app.use(errorHandler);return app;
}

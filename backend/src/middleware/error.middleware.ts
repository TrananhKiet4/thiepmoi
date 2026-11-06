import express from 'express';
import {ZodError} from 'zod';
import {Prisma} from '@prisma/client';
import multer from 'multer';
import {AppError} from '../errors/app-error.js';
import type {ErrorRequestHandler} from 'express';

export const errorHandler:ErrorRequestHandler=(error:any,req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  let status=500,code='INTERNAL_ERROR',message='Có lỗi xảy ra, vui lòng thử lại',fields:Record<string,string>|undefined;
  if(error instanceof AppError){({status,code,message,fields}=error);}
  else if(error instanceof ZodError){status=400;code='VALIDATION_ERROR';message='Dữ liệu không hợp lệ';fields=Object.fromEntries(error.issues.map(i=>[i.path.join('.'),i.message]));}
  else if(error instanceof Prisma.PrismaClientKnownRequestError){
   if(['P2002','P2034','P2003'].includes(error.code)){status=409;code='CONFLICT';message='Dữ liệu đã thay đổi hoặc bị trùng, vui lòng tải lại';}
   else if(error.code==='P2025'){status=404;code='NOT_FOUND';message='Không tìm thấy dữ liệu';}
   else if(error.code==='P2024'||error.code==='P2028'||error.code==='P2010'&&error.meta?.code==='55P03'){
    status=503;code='DATABASE_BUSY';message='Hệ thống đang bận, vui lòng thử lại sau ít giây';res.set('Retry-After','2');
   }
  }
  else if(error instanceof multer.MulterError){status=400;code='UPLOAD_INVALID';message='File không hợp lệ hoặc vượt quá giới hạn';}
  else if(error?.type==='entity.too.large'){status=413;code='BODY_TOO_LARGE';message='Dữ liệu quá lớn';}
  else if(error instanceof SyntaxError&&'body' in error){status=400;code='JSON_INVALID';message='JSON không hợp lệ';}
  if(status>=500)console.error(JSON.stringify({requestId:req.requestId,code}));
  res.status(status).json({error:{code,message,...(fields?{fields}:{}),requestId:req.requestId}});
 };

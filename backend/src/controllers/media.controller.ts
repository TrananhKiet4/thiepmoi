import multer from 'multer';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {assetIds,type Content} from '../../../packages/contracts/src/index.js';
import {prisma,withTransaction} from '../config/database.js';
import {config} from '../config/env.js';
import {AppError} from '../errors/app-error.js';
import {ok,ownedEvent,audit} from '../utils/http.js';
import {processMedia} from '../services/media-processing.service.js';
import {putPrivate,deleteStored,readStored,validMediaSignature} from '../services/storage.service.js';
import type {RequestHandler} from 'express';
import {Variant,variants,mediaView} from '../services/media.service.js';

export const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1,fields:1,fieldSize:4096,parts:2}}).single('file');
export const uuid=z.string().uuid();
export const getAdminMediaFile:RequestHandler=async(req,res)=>{
 const key=String(req.query.key??''),expires=Number(req.query.expires),signature=String(req.query.signature??'');
 if(!validMediaSignature(key,expires,signature))throw new AppError(403,'INVALID_MEDIA_SIGNATURE','URL preview đã hết hạn');
 const eventId=key.split('/')[0];await ownedEvent(req,uuid.parse(eventId));
 let bytes:Buffer;try{bytes=await readStored(key);}catch{throw new AppError(404,'NOT_FOUND','Không tìm thấy media');}
 res.set('Cache-Control','private, no-store').type(key.endsWith('.webp')?'image/webp':key.endsWith('.mp3')?'audio/mpeg':'audio/mp4').send(bytes);
};
export const getMediaKey:RequestHandler=async(req,res)=>{
 if(config.storageDriver!=='local')throw new AppError(404,'NOT_FOUND','Không tìm thấy media');
 const key=Array.isArray(req.params.key)?req.params.key.join('/'):String(req.params.key);
 const [eventId,id]=key.split('/');
 if(!uuid.safeParse(eventId).success||!uuid.safeParse(id).success)throw new AppError(404,'NOT_FOUND','Không tìm thấy media');
 const asset=await prisma.mediaAsset.findFirst({where:{id,eventId,status:'READY',publicReady:true}});
 if(!asset||!Object.values(variants(asset)).some(variant=>variant.key===key))throw new AppError(404,'NOT_FOUND','Không tìm thấy media');
 let bytes:Buffer;try{bytes=await readStored(key,true);}catch{throw new AppError(404,'NOT_FOUND','Không tìm thấy media');}
 res.set('Cache-Control','public, max-age=31536000, immutable').type(key.endsWith('.webp')?'image/webp':key.endsWith('.mp3')?'audio/mpeg':'audio/mp4').send(bytes);
};
export const getAdminEventsMedia:RequestHandler=async(req,res)=>{
 const eventId=uuid.parse(req.params.id);await ownedEvent(req,eventId);const assets=await prisma.mediaAsset.findMany({where:{eventId},orderBy:{createdAt:'desc'}});
 ok(res,{items:await Promise.all(assets.map(async asset=>({...await mediaView(asset,true),originalName:asset.originalName,bytes:asset.bytes,createdAt:asset.createdAt})))});
};
export const postAdminEventsMediaMiddleware1:RequestHandler=(req,res,next)=>upload(req,res,error=>error?next(new AppError(413,'UPLOAD_LIMIT','File tối đa 10 MB, một file mỗi lần')):next());
export const postAdminEventsMedia:RequestHandler=async(req,res)=>{
 const eventId=uuid.parse(req.params.id);await ownedEvent(req,eventId);const alt=z.string().trim().max(500).parse(req.body.alt??'');
 if(!req.file)throw new AppError(422,'FILE_REQUIRED','Vui lòng chọn file');
 let processed;try{processed=await processMedia(req.file.buffer,req.file.originalname,config.ffmpegPath);}catch(error){throw new AppError((error as any).code==='AUDIO_DECODER_UNAVAILABLE'?503:422,(error as any).code??'INVALID_MEDIA',(error as Error).message);}
 const id=randomUUID(),stored:Variant[]=[];
 try{
  for(const file of processed.files){const key=`${eventId}/${id}/${file.suffix}`;await putPrivate(key,file.bytes,file.mimeType);stored.push({key,width:file.width,height:file.height,mimeType:file.mimeType});}
  const asset=await prisma.mediaAsset.create({data:{id,eventId,storageKey:stored.at(-1)!.key,originalName:req.file.originalname.replace(/[\x00-\x1f\x7f\\/]/g,'_').slice(0,255),type:processed.type,mimeType:processed.mimeType,bytes:processed.files.reduce((sum,f)=>sum+f.bytes.length,0),width:processed.width,height:processed.height,alt,variants:JSON.parse(JSON.stringify(Object.fromEntries(stored.map((v,i)=>[String(i),v]))))}});
  ok(res,await mediaView(asset,true),201);
 }catch(error){await Promise.allSettled(stored.map(v=>deleteStored(v.key)));throw error;}
};
export const patchAdminMedia:RequestHandler=async(req,res)=>{
 const id=uuid.parse(req.params.id),asset=await prisma.mediaAsset.findUnique({where:{id}});if(!asset)throw new AppError(404,'NOT_FOUND','Không tìm thấy media');await ownedEvent(req,asset.eventId);
 const {alt}=z.object({alt:z.string().trim().max(500)}).strict().parse(req.body);ok(res,await mediaView(await prisma.mediaAsset.update({where:{id},data:{alt}}),true));
};
export const deleteAdminMedia:RequestHandler=async(req,res)=>{
 const id=uuid.parse(req.params.id);
 const asset=await withTransaction(async tx=>{
  const asset=await tx.mediaAsset.findUnique({where:{id}});if(!asset)throw new AppError(404,'NOT_FOUND','Không tìm thấy media');await ownedEvent(req,asset.eventId,tx);
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id=${asset.eventId}::uuid FOR UPDATE`;
  const revisions=await tx.eventRevision.findMany({where:{eventId:asset.eventId}});
  if(revisions.some(r=>assetIds(r.contentJson as Content).includes(id)))throw new AppError(409,'ASSET_IN_USE','Media đang được phiên bản nội dung giữ tham chiếu');
  await tx.mediaAsset.delete({where:{id}});await audit(tx,req,'MEDIA_DELETE',asset.eventId,'MediaAsset',id);return asset;
 });
 for(const variant of Object.values(variants(asset))){await deleteStored(variant.key);if(asset.publicReady)await deleteStored(variant.key,true);}
 ok(res,{deleted:true});
};

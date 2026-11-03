import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assetIds, type Content, type MediaView } from '../../../packages/contracts/src/index.js';
import { prisma, withTransaction, type Tx } from './db.js';
import { config } from './config.js';
import { requireAdmin } from './auth.js';
import { AppError, ok, ownedEvent, audit } from './http.js';
import { processMedia } from './media-processing.js';
import { putPrivate, copyPublic, deleteStored, storageUrl, readStored, validMediaSignature } from './storage.js';
type Variant={key:string;width?:number;height?:number;mimeType:string};
const variants=(asset:{variants:unknown})=>asset.variants as Record<string,Variant>;
export const mediaRouter=Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1,fields:1,fieldSize:4096,parts:2}}).single('file');
const uuid=z.string().uuid();
async function mediaView(asset:any,admin:boolean):Promise<MediaView>{
 const all=Object.values(variants(asset));return {id:asset.id,alt:asset.alt,type:asset.type,width:asset.width,height:asset.height,url:await storageUrl(asset.storageKey,admin),...(asset.type==='IMAGE'?{srcSet:(await Promise.all(all.map(async v=>`${await storageUrl(v.key,admin)} ${v.width}w`))).join(', ')}:{})};
}
export async function mediaUrls(content:Content,admin:boolean):Promise<Record<string,MediaView>>{
 const ids=assetIds(content),assets=await prisma.mediaAsset.findMany({where:{id:{in:ids},status:'READY',...(!admin?{publicReady:true}:{})}});
 return Object.fromEntries(await Promise.all(assets.map(async a=>[a.id,await mediaView(a,admin)])));
}
export async function preparePublishedMedia(eventId:string,content:Content,tx:Tx|typeof prisma=prisma){
 const ids=assetIds(content),assets=await tx.mediaAsset.findMany({where:{id:{in:ids},eventId,status:'READY'}});
 if(assets.length!==ids.length)throw new AppError(422,'INVALID_MEDIA','Media thiếu hoặc không thuộc sự kiện');
 const music=content.music.assetId;if(music&&assets.find(a=>a.id===music)?.type!=='AUDIO')throw new AppError(422,'INVALID_MEDIA','Nhạc phải là file âm thanh');
 const imageIds=assetIds({...content,music:{...content.music,assetId:null}});
 for(const asset of assets){
  if(imageIds.includes(asset.id)&&asset.type!=='IMAGE')throw new AppError(422,'INVALID_MEDIA','Vị trí ảnh phải dùng ảnh');
  const files=Object.values(variants(asset));if(!files.length||!files.some(file=>file.key===asset.storageKey))throw new AppError(422,'INVALID_MEDIA','Media chưa có bản phân phối hợp lệ');
  for(const variant of files)await copyPublic(variant.key,variant.mimeType);
  await tx.mediaAsset.update({where:{id:asset.id},data:{publicReady:true}});
 }
}
mediaRouter.get('/admin/media/file',requireAdmin,async(req,res)=>{
 const key=String(req.query.key??''),expires=Number(req.query.expires),signature=String(req.query.signature??'');
 if(!validMediaSignature(key,expires,signature))throw new AppError(403,'INVALID_MEDIA_SIGNATURE','URL preview đã hết hạn');
 const eventId=key.split('/')[0];await ownedEvent(req,uuid.parse(eventId));
 let bytes:Buffer;try{bytes=await readStored(key);}catch{throw new AppError(404,'NOT_FOUND','Không tìm thấy media');}
 res.set('Cache-Control','private, no-store').type(key.endsWith('.webp')?'image/webp':key.endsWith('.mp3')?'audio/mpeg':'audio/mp4').send(bytes);
});
mediaRouter.get('/media/{*key}',async(req,res)=>{
 if(config.storageDriver!=='local')throw new AppError(404,'NOT_FOUND','Không tìm thấy media');
 const key=Array.isArray(req.params.key)?req.params.key.join('/'):String(req.params.key);
 const [eventId,id]=key.split('/');
 if(!uuid.safeParse(eventId).success||!uuid.safeParse(id).success)throw new AppError(404,'NOT_FOUND','Không tìm thấy media');
 const asset=await prisma.mediaAsset.findFirst({where:{id,eventId,status:'READY',publicReady:true}});
 if(!asset||!Object.values(variants(asset)).some(variant=>variant.key===key))throw new AppError(404,'NOT_FOUND','Không tìm thấy media');
 let bytes:Buffer;try{bytes=await readStored(key,true);}catch{throw new AppError(404,'NOT_FOUND','Không tìm thấy media');}
 res.set('Cache-Control','public, max-age=31536000, immutable').type(key.endsWith('.webp')?'image/webp':key.endsWith('.mp3')?'audio/mpeg':'audio/mp4').send(bytes);
});
mediaRouter.get('/admin/events/:id/media',requireAdmin,async(req,res)=>{
 const eventId=uuid.parse(req.params.id);await ownedEvent(req,eventId);const assets=await prisma.mediaAsset.findMany({where:{eventId},orderBy:{createdAt:'desc'}});
 ok(res,{items:await Promise.all(assets.map(async asset=>({...await mediaView(asset,true),originalName:asset.originalName,bytes:asset.bytes,createdAt:asset.createdAt})))});
});
mediaRouter.post('/admin/events/:id/media',requireAdmin,(req,res,next)=>upload(req,res,error=>error?next(new AppError(413,'UPLOAD_LIMIT','File tối đa 10 MB, một file mỗi lần')):next()),async(req,res)=>{
 const eventId=uuid.parse(req.params.id);await ownedEvent(req,eventId);const alt=z.string().trim().max(500).parse(req.body.alt??'');
 if(!req.file)throw new AppError(422,'FILE_REQUIRED','Vui lòng chọn file');
 let processed;try{processed=await processMedia(req.file.buffer,req.file.originalname,config.ffmpegPath);}catch(error){throw new AppError((error as any).code==='AUDIO_DECODER_UNAVAILABLE'?503:422,(error as any).code??'INVALID_MEDIA',(error as Error).message);}
 const id=randomUUID(),stored:Variant[]=[];
 try{
  for(const file of processed.files){const key=`${eventId}/${id}/${file.suffix}`;await putPrivate(key,file.bytes,file.mimeType);stored.push({key,width:file.width,height:file.height,mimeType:file.mimeType});}
  const asset=await prisma.mediaAsset.create({data:{id,eventId,storageKey:stored.at(-1)!.key,originalName:req.file.originalname.replace(/[\x00-\x1f\x7f\\/]/g,'_').slice(0,255),type:processed.type,mimeType:processed.mimeType,bytes:processed.files.reduce((sum,f)=>sum+f.bytes.length,0),width:processed.width,height:processed.height,alt,variants:JSON.parse(JSON.stringify(Object.fromEntries(stored.map((v,i)=>[String(i),v]))))}});
  ok(res,await mediaView(asset,true),201);
 }catch(error){await Promise.allSettled(stored.map(v=>deleteStored(v.key)));throw error;}
});
mediaRouter.patch('/admin/media/:id',requireAdmin,async(req,res)=>{
 const id=uuid.parse(req.params.id),asset=await prisma.mediaAsset.findUnique({where:{id}});if(!asset)throw new AppError(404,'NOT_FOUND','Không tìm thấy media');await ownedEvent(req,asset.eventId);
 const {alt}=z.object({alt:z.string().trim().max(500)}).strict().parse(req.body);ok(res,await mediaView(await prisma.mediaAsset.update({where:{id},data:{alt}}),true));
});
mediaRouter.delete('/admin/media/:id',requireAdmin,async(req,res)=>{
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
});

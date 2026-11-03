import {assetIds,type Content,type MediaView} from '../../../packages/contracts/src/index.js';
import {prisma,type Tx} from '../config/database.js';
import {AppError} from '../errors/app-error.js';
import {copyPublic,storageUrl} from './storage.service.js';

export type Variant={key:string;width?:number;height?:number;mimeType:string};
export const variants=(asset:{variants:unknown})=>asset.variants as Record<string,Variant>;
export async function mediaView(asset:any,admin:boolean):Promise<MediaView>{
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

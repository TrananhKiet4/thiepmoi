import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import sharp from 'sharp';

export async function prepareCompanionPhotos(source='đồng hành',target='frontend/public/invitation-assets/photos/companions'){
 const photos=readdirSync(source,{withFileTypes:true}).filter(entry=>entry.isFile()&&/\.(jpe?g|png|webp|heic|avif|tiff?)$/i.test(entry.name)).map(({name})=>{
  const match=/^(\d+)\.(?:jpe?g|png|webp)$/i.exec(name);
  const number=Number(match?.[1]);
  assert(Number.isSafeInteger(number)&&number>0,'Đặt tên ảnh bằng số và dùng JPEG, PNG hoặc WebP.');
  return {name,number};
 }).sort((a,b)=>a.number-b.number);
 assert.equal(new Set(photos.map(photo=>photo.number)).size,photos.length,'Mỗi ảnh cần một số riêng.');
 if(!photos.length)return [];
 mkdirSync(target,{recursive:true});
 const prepared=[];
 for(const {name,number} of photos){
  const id=String(number).padStart(2,'0'),image=sharp(join(source,name)).rotate();
  const full=await image.clone().resize({width:1440,height:1440,fit:'inside',withoutEnlargement:true}).webp({quality:83}).toBuffer({resolveWithObject:true});
  const small=await image.resize({width:600,height:900,fit:'inside',withoutEnlargement:true}).webp({quality:79}).toBuffer({resolveWithObject:true});
  for(const [file,data] of [[id+'.webp',full.data],[id+'-small.webp',small.data]]){
   const path=join(target,file);
   if(existsSync(path))assert(readFileSync(path).equals(data),`Ảnh số ${id} đã có nội dung khác. Dùng số mới để thêm ảnh.`);
   else writeFileSync(path,data,{flag:'wx'});
  }
  prepared.push({id,width:full.info.width,height:full.info.height,smallWidth:small.info.width});
 }
 return prepared;
}

import sharp from 'sharp';
import {parseBuffer} from 'music-metadata';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {join} from 'node:path';
import {config} from '../config/env.js';

export type ProcessedMedia={type:'IMAGE'|'AUDIO';mimeType:string;width?:number;height?:number;files:{suffix:string;bytes:Buffer;width?:number;height?:number;mimeType:string}[]};
async function decodeAudio(bytes:Buffer,path:string):Promise<void>{
 const root=join(config.storageRoot,'.tmp');await mkdir(root,{recursive:true,mode:0o700});const directory=await mkdtemp(join(root,'decode-')),input=join(directory,'input.audio');
 try{
 await writeFile(input,bytes,{flag:'wx',mode:0o600});
 await new Promise<void>((resolve,reject)=>{
  const child=spawn(path,['-v','error','-xerror','-nostdin','-protocol_whitelist','file,pipe','-i',input,'-map','0:a:0','-f','null','-'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
  let errors=0,timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},20000);
  child.stderr.on('data',chunk=>{errors+=chunk.length;if(errors>65536)child.kill('SIGKILL');});
  child.once('error',()=>{clearTimeout(timer);reject(Object.assign(new Error('Chưa có ffmpeg để kiểm tra decode âm thanh'),{code:'AUDIO_DECODER_UNAVAILABLE'}));});
  child.once('close',code=>{clearTimeout(timer);code===0&&errors===0?resolve():reject(new Error(timedOut?'Audio vượt thời gian decode 20 giây':'File âm thanh không decode được'));});
 });
 }finally{await unlink(input).catch(error=>{if(error.code!=='ENOENT')throw error;});await rmdir(directory);}
}
export async function processMedia(bytes:Buffer,name:string,ffmpegPath='ffmpeg'):Promise<ProcessedMedia>{
 if(!bytes.length||bytes.length>10*1024*1024)throw new Error('File media tối đa 10 MB');
 const jpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff,png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(jpeg||png||webp){
  if(!/\.(jpe?g|png|webp)$/i.test(name))throw new Error('Định dạng ảnh không hợp lệ');
  const image=sharp(bytes,{limitInputPixels:40000000,failOn:'warning',animated:false});const metadata=await image.metadata();
  if(!metadata.width||!metadata.height||(metadata.pages??1)>1)throw new Error('Chỉ nhận ảnh tĩnh hợp lệ');
  const edge=Math.max(metadata.width,metadata.height),sizes=[...new Set([Math.min(edge,640),Math.min(edge,1280),Math.min(edge,1920)])];const variants:ProcessedMedia['files']=[];
  for(const size of sizes){const {data,info}=await sharp(bytes,{limitInputPixels:40000000,failOn:'warning'}).rotate().resize({width:size,height:size,fit:'inside',withoutEnlargement:true}).webp({quality:78,effort:4}).toBuffer({resolveWithObject:true});variants.push({suffix:`${info.width}.webp`,bytes:data,width:info.width,height:info.height,mimeType:'image/webp'});}
  const files=variants.filter((file,index)=>variants.findLastIndex(other=>other.width===file.width)===index);
  return {type:'IMAGE',mimeType:'image/webp',width:files.at(-1)!.width,height:files.at(-1)!.height,files};
 }
 const mp3=bytes.toString('ascii',0,3)==='ID3'||(bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0),m4a=bytes.toString('ascii',4,8)==='ftyp';
 if(!(mp3&&/\.mp3$/i.test(name)||m4a&&/\.m4a$/i.test(name)))throw new Error('Chỉ nhận JPEG, PNG, WebP, MP3 hoặc M4A hợp lệ');
 const mimeType=mp3?'audio/mpeg':'audio/mp4';const metadata=await parseBuffer(bytes,{mimeType,size:bytes.length},{duration:true,skipCovers:true});
 if(mp3&&(metadata.format.container!=='MPEG'||!metadata.format.codec?.endsWith('Layer 3'))||metadata.format.hasVideo||metadata.format.trackInfo?.some(track=>track.video))throw new Error('Chỉ nhận âm thanh MP3 hoặc M4A');
 if(!metadata.format.codec||!metadata.format.duration||!Number.isFinite(metadata.format.duration))throw new Error('Âm thanh không hợp lệ');
 await decodeAudio(bytes,ffmpegPath);
 return {type:'AUDIO',mimeType,files:[{suffix:mp3?'audio.mp3':'audio.m4a',bytes,mimeType}]};
}

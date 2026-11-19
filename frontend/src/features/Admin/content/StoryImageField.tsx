import {useLayoutEffect, useRef, useState} from 'react';
import {ImagePlus, Trash2} from 'lucide-react';
import type {UploadedImage} from '@invite/contracts';
import {request} from '../../../lib/api';
import {ErrorBox} from '../../../components/ui';

async function prepareImage(file:File):Promise<File>{
 if(file.size>5*1024*1024)throw new Error('Ảnh tối đa 5 MB');
 const header=new Uint8Array(await file.slice(0,12).arrayBuffer());
 const signature=Array.from(header).map(byte=>byte.toString(16).padStart(2,'0')).join('');
 if(!signature.startsWith('89504e470d0a1a0a')&&!signature.startsWith('ffd8ff')&&!(signature.startsWith('52494646')&&signature.slice(16,24)==='57454250')){
  throw new Error('Vui lòng chọn ảnh JPG, PNG hoặc WebP');
 }
 const image=new Image(),url=URL.createObjectURL(file);
 try{
  image.src=url;
  await image.decode();
  const canvas=document.createElement('canvas');
  const context=canvas.getContext('2d');
  if(!context)throw new Error('Trình duyệt chưa hỗ trợ xử lý ảnh');
  let scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
  for(let attempt=0;attempt<4;attempt++){
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   context.drawImage(image,0,0,canvas.width,canvas.height);
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',.82));
   if(!blob)throw new Error('Không xử lý được ảnh đã chọn');
   if(blob.size<=1.5*1024*1024){
    const extension=blob.type==='image/webp'?'webp':'png';
    return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.'+extension,{type:blob.type});
   }
   scale*=Math.min(.8,Math.sqrt(1.5*1024*1024/blob.size)*.9);
  }
  throw new Error('Ảnh quá lớn sau khi nén, vui lòng chọn ảnh nhỏ hơn');
 }finally{URL.revokeObjectURL(url);}
}

export function StoryImageField({eventId,value,onChange}:{
 eventId:string;value:UploadedImage|null;onChange:(image:UploadedImage|null)=>void;
}){
 const input=useRef<HTMLInputElement>(null);
 const currentChange=useRef<typeof onChange|null>(onChange);
 useLayoutEffect(()=>{currentChange.current=onChange;return()=>{currentChange.current=null;};},[onChange]);
 const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);
 return <div className="story-image-field">
  <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Chọn ảnh từ thiết bị" disabled={busy} onChange={async event=>{
   const file=event.target.files?.[0];
   event.target.value='';
   if(!file||busy)return;
   setError(null);setBusy(true);
   try{
    const prepared=await prepareImage(file);
    if(!currentChange.current)return;
    const form=new FormData();form.append('file',prepared);
    const image=await request(`/admin/events/${eventId}/story-images`,{method:'POST',body:form});
    currentChange.current?.(image);
   }catch(error){setError(error);}finally{setBusy(false);}
  }}/>
  <div className="row wrap">
   <button type="button" className="button secondary" disabled={busy} onClick={()=>input.current?.click()}><ImagePlus size={17}/>{busy?'Đang tải ảnh…':'Tải ảnh lên'}</button>
   {value&&<button type="button" className="button secondary" disabled={busy} onClick={()=>onChange(null)}><Trash2 size={16}/> Gỡ ảnh đã tải</button>}
  </div>
  <p className="small muted">Chọn từ thư viện ảnh trên điện thoại hoặc máy tính. JPG, PNG, WebP · Tối đa 5 MB.</p>
  {value&&<div className="campus-map-preview"><img src={value.url} alt="Ảnh đã tải lên" width={value.width} height={value.height} style={{maxWidth:320,maxHeight:240,objectFit:'contain',marginTop:12}}/></div>}
  <ErrorBox error={error}/>
 </div>;
}

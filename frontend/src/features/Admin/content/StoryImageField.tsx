import {useLayoutEffect, useRef, useState} from 'react';
import {ImagePlus, Trash2} from 'lucide-react';
import type {UploadedImage} from '@invite/contracts';
import {request} from '../../../lib/api';
import {ErrorBox} from '../../../components/ui';
import {prepareImage} from '../../../utils/image';


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

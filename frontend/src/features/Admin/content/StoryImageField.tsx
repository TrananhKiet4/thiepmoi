import {useRef, useState} from 'react';
import {ImagePlus, Trash2} from 'lucide-react';
import {request} from '../../../lib/api';
import {ErrorBox} from '../../../components/ui';

type Image={url:string;width:number;height:number};

export function StoryImageField({eventId,value,onChange}:{
 eventId:string;value:Image|null;onChange:(image:Image|null)=>void;
}){
 const input=useRef<HTMLInputElement>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);
 return <div className="story-image-field">
  <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Chọn ảnh từ thiết bị" disabled={busy} onChange={async event=>{
   const file=event.target.files?.[0];
   event.target.value='';
   if(!file||busy)return;
   setError(null);setBusy(true);
   try{
    if(file.size>5*1024*1024)throw new Error('Ảnh tối đa 5 MB');
    const form=new FormData();form.append('file',file);
    const image=await request(`/admin/events/${eventId}/story-images`,{method:'POST',body:form});
    onChange(image);
   }catch(error){setError(error);}finally{setBusy(false);}
  }}/>
  <div className="row wrap">
   <button type="button" className="button secondary" disabled={busy} onClick={()=>input.current?.click()}><ImagePlus size={17}/>{busy?'Đang tải ảnh…':'Tải ảnh lên'}</button>
   {value&&<button type="button" className="button secondary" disabled={busy} onClick={()=>onChange(null)}><Trash2 size={16}/> Gỡ ảnh đã tải</button>}
  </div>
  <p className="small muted">Chọn từ thư viện ảnh trên điện thoại hoặc máy tính. JPG, PNG, WebP · Tối đa 5 MB.</p>
  {value&&<img src={value.url} alt="Ảnh đã tải cho câu chuyện" width={value.width} height={value.height} style={{maxWidth:320,maxHeight:240,objectFit:'contain',marginTop:12}}/>}
  <ErrorBox error={error}/>
 </div>;
}

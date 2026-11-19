import {useEffect,useRef,useState} from 'react';
import {ImagePlus,Trash2} from 'lucide-react';
import type {WishImage} from '@invite/contracts';
import {ErrorBox} from '../../../components/ui';
import {request} from '../../../lib/api';
import {prepareImage} from '../../../utils/image';

export function WishImageField({token,value,onChange,onBusy,disabled}:{
 token?:string;value:WishImage|null;onChange:(image:WishImage|null)=>void;onBusy:(busy:boolean)=>void;disabled:boolean;
}){
 const input=useRef<HTMLInputElement>(null),active=useRef(true);
 const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 return <div className="wish-image-field">
  <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Chọn ảnh đính kèm lời chúc" disabled={disabled||busy} onChange={async event=>{
   const file=event.target.files?.[0];event.target.value='';
   if(!file||!token||busy)return;
   setError(null);setBusy(true);onBusy(true);
   try{
    const prepared=await prepareImage(file);
    if(!active.current)return;
    const form=new FormData();form.append('file',prepared);
    const image=await request('/guest/wish-image',{method:'POST',body:form},token);
    if(active.current)onChange(image);
   }catch(error){if(active.current)setError(error);}finally{if(active.current){setBusy(false);onBusy(false);}}
  }}/>
  <div className="row wrap">
   <button type="button" className="button secondary" disabled={disabled||busy} onClick={()=>input.current?.click()}><ImagePlus size={17}/>{busy?'Đang tải ảnh…':value?'Thay ảnh':'Thêm ảnh kèm lời chúc'}</button>
   {value&&<button type="button" className="button secondary" disabled={disabled||busy} onClick={()=>onChange(null)}><Trash2 size={16}/>Gỡ ảnh</button>}
  </div>
  <p className="small muted">Một ảnh JPG, PNG hoặc WebP · Tối đa 5 MB. Ảnh được gửi cùng lời chúc khi bấm Gửi lời hồi đáp.</p>
  {value&&<img className="wish-image-preview" src={value.url} alt="Ảnh đính kèm lời chúc"/>}
  <ErrorBox error={error}/>
 </div>;
}

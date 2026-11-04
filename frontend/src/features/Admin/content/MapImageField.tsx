import {useState} from 'react';
import {uploadMedia} from '../../../lib/api';
import {ErrorBox,Field} from '../../../components/ui/index';

export function MapImageField({eventId,value,venueName,media,onChange,onUploaded,onBusyChange}:{eventId:string;value:string|null;venueName:string;media:any[];onChange:(id:string|null)=>void;onUploaded:()=>Promise<unknown>;onBusyChange:(busy:boolean)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),selected=media.find(item=>item.id===value);
 async function upload(file:File){
  setBusy(true);onBusyChange(true);setError(null);
  try{
   if(!/\.(jpe?g|png|webp)$/i.test(file.name))throw new Error('Chọn ảnh JPG, PNG hoặc WebP');
   const asset=await uploadMedia(eventId,file,('Sơ đồ trường '+venueName).trim());
   await onUploaded();onChange(asset.id);
  }catch(error){setError(error);}finally{setBusy(false);onBusyChange(false);}
 }
 return <section className="campus-map-field" aria-label="Ảnh sơ đồ trường"><h3>Ảnh sơ đồ trường</h3><p className="small muted">Tải sơ đồ khuôn viên, cổng vào hoặc vị trí hội trường. JPG, PNG, WebP · tối đa 10 MB.</p><div className="form-grid"><Field label="Chọn ảnh sơ đồ từ thư viện"><select disabled={busy} value={value||''} onChange={event=>onChange(event.target.value||null)}><option value="">Chưa chọn ảnh</option>{media.filter(item=>item.type==='IMAGE').map(item=><option key={item.id} value={item.id}>{item.alt||item.originalName||item.id}</option>)}</select></Field><Field label="Tải ảnh sơ đồ trường"><input disabled={busy} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);event.target.value='';}}/></Field></div>{busy&&<p role="status" className="small muted">Đang tải ảnh sơ đồ…</p>}{selected&&<div className="campus-map-preview"><img src={selected.url} alt="Sơ đồ trường đã chọn"/><button type="button" className="button secondary" disabled={busy} onClick={()=>onChange(null)}>Gỡ ảnh sơ đồ</button></div>}<ErrorBox error={error}/></section>;
}

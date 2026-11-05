import {useRef,useState} from 'react';
import {ImagePlus,Save,Trash2,Upload} from 'lucide-react';
import {uploadMedia,useApi} from '../../../lib/api';
import {useAdmin} from '../../../contexts/AdminContext';
import {Action,Empty,ErrorBox,Field,Loading,PageHead} from '../../../components/ui/index';

export function MediaLibrary(){
 const {event,change,refresh}=useAdmin(),query=useApi(`/admin/events/${event.id}/media`),input=useRef<HTMLInputElement>(null);
 const [files,setFiles]=useState<File[]>([]),[alt,setAlt]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);
 const [failures,setFailures]=useState<{file:File;error:unknown}[]>([]),[progress,setProgress]=useState<{done:number;total:number}|null>(null),[result,setResult]=useState<{uploaded:number;total:number}|null>(null);
 return <><PageHead eyebrow="NHỮNG MẢNH GHÉP KỶ NIỆM" title="Lưu giữ từng khoảnh khắc." description="Thư viện ảnh và âm nhạc cho thiệp mời của bạn."/>
 <section className="panel upload-panel"><ImagePlus size={34} strokeWidth={1}/><div><h2>Thêm những kỷ niệm mới</h2><p className="muted small">Chọn nhiều file cùng lúc · Ảnh JPG, PNG, WebP · Nhạc MP3, M4A · Tối đa 10 MB/file</p></div>
  <form onSubmit={async e=>{
   e.preventDefault();if(!files.length||busy)return;
   const batch=files,failed:{file:File;error:unknown}[]=[];
   setBusy(true);setError(null);setFailures([]);setResult(null);setProgress({done:0,total:batch.length});
   try{
    for(const [index,file] of batch.entries()){
     try{await uploadMedia(event.id,file,alt);}catch(error){failed.push({file,error});}
     setProgress({done:index+1,total:batch.length});
    }
    setFiles(failed.map(item=>item.file));setFailures(failed);setResult({uploaded:batch.length-failed.length,total:batch.length});
    if(input.current)input.current.value='';if(!failed.length)setAlt('');
    await refresh();
   }catch(error){setError(error);}finally{setBusy(false);setProgress(null);}
  }}>
   <Field label="Chọn file"><input ref={input} type="file" multiple disabled={busy} accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,.m4a" onChange={e=>{setFiles(Array.from(e.target.files||[]));setFailures([]);setResult(null);setError(null);}}/></Field>
   <Field label="Mô tả ảnh / tên bản nhạc" value={alt} maxLength={500} disabled={busy} onChange={(e:any)=>setAlt(e.target.value)}/>
   <button className="button" disabled={busy||!files.length}><Upload size={16}/>{busy?'Đang xử lý…':failures.length?'Thử lại các file lỗi':'Tải lên thư viện'}</button>
   <ErrorBox error={error}/>
  </form>
  <div className="upload-feedback">
   {files.length>0&&!busy&&<p className="small muted">{failures.length?'Còn':'Đã chọn'} {files.length} file{failures.length?' chưa tải được':''}.</p>}
   {(progress||result)&&<p role="status" className="small">{progress?`Đang xử lý ${progress.done}/${progress.total} file…`:`Đã tải ${result!.uploaded}/${result!.total} file.`}</p>}
   {failures.length>0&&<ul className="upload-errors">{failures.map((item,index)=><li key={index}><strong>{item.file.name}</strong><ErrorBox error={item.error}/></li>)}</ul>}
  </div>
 </section>
 <ErrorBox error={query.error}/>{query.isPending?<Loading/>:query.data?.items.length?<div className="media-grid">{query.data.items.map((item:any)=><MediaCard key={item.id} item={item} change={change}/>)}</div>:<Empty>Thêm ảnh đầu tiên để bắt đầu câu chuyện của bạn.</Empty>}</>;
}

export function MediaCard({item,change}:{item:any;change:any}){
 const originalName=item.originalName||item.originalFilename||'', [name,setName]=useState(originalName),[alt,setAlt]=useState(item.alt),[saving,setSaving]=useState(false);
 const nameChanged=name!==originalName;
 return <article className="panel media-card"><div className="media-preview">{item.type==='AUDIO'||item.type?.startsWith('audio')?<audio controls src={item.url} preload="none"/>:<img src={item.url} alt={item.alt||originalName} loading="lazy"/>}</div>
  <div className="media-card-body"><small className="muted">{originalName||item.type} {item.width?`· ${item.width} × ${item.height}`:''}</small>
   <Field label="Tên hiển thị" value={name} maxLength={255} disabled={saving} onChange={(e:any)=>setName(e.target.value)}/>
   <Field label="Mô tả thay thế" value={alt} maxLength={500} disabled={saving} onChange={(e:any)=>setAlt(e.target.value)}/>
   <div className="row between"><Action disabled={saving||!nameChanged&&alt===item.alt||nameChanged&&!name.trim()} run={async()=>{
    setSaving(true);try{const saved=await change(`/admin/media/${item.id}`,'PATCH',{alt,...(nameChanged?{originalName:name}:{})});setName(saved.originalName);setAlt(saved.alt);}finally{setSaving(false);}
   }}><Save size={15}/> Lưu thay đổi</Action>
   <Action className="icon-button danger" disabled={saving} confirm="Xóa file này khỏi thư viện? File đang được dùng sẽ được giữ lại." run={()=>change(`/admin/media/${item.id}`,'DELETE')}><Trash2 size={17}/><span className="sr-only">Xóa file</span></Action></div>
  </div>
 </article>;
}

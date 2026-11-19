import {staticMedia,type UploadedImage} from '@invite/contracts';
import {Field} from '../../../components/ui';
import {useAdmin} from '../../../contexts/AdminContext';
import {StoryImageField} from './StoryImageField';

const images=Object.values(staticMedia).filter(asset=>asset.type==='IMAGE');

export function ImageField({label,assetId,image,onChange}:{
 label:string;assetId:string|null;image?:UploadedImage|null;
 onChange:(assetId:string|null,image:UploadedImage|null)=>void;
}){
 const {event}=useAdmin();
 const selected=assetId?staticMedia[assetId]:undefined;
 return <div>
  <Field label={label}><select value={image?'uploaded':assetId||''} onChange={e=>onChange(e.target.value||null,null)}>
   <option value="">Chưa chọn</option>
   {image&&<option value="uploaded" disabled>Ảnh đã tải lên</option>}
   {images.map(asset=><option key={asset.id} value={asset.id}>{asset.originalName}</option>)}
  </select></Field>
  <StoryImageField eventId={event.id} value={image??null} onChange={next=>onChange(null,next)}/>
  {!image&&selected?.type==='IMAGE'&&<div className="campus-map-preview"><img src={selected.url} alt={label} width={selected.width??undefined} height={selected.height??undefined}/></div>}
 </div>;
}

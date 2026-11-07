import {staticMedia} from '@invite/contracts';
import {Field} from '../../../components/ui/index';

const images=Object.values(staticMedia).filter(asset=>asset.type==='IMAGE');

export function MapImageField({value,onChange}:{value:string|null;onChange:(id:string|null)=>void}){
 const selected=value?staticMedia[value]:undefined;
 return <section className="campus-map-field" aria-label="Ảnh sơ đồ trường">
  <h3>Ảnh sơ đồ trường</h3>
  <div className="form-grid"><Field label="Chọn ảnh sơ đồ trường"><select value={value||''} onChange={event=>onChange(event.target.value||null)}>
   <option value="">Chưa chọn ảnh</option>
   {images.map(asset=><option key={asset.id} value={asset.id}>{asset.originalName}</option>)}
  </select></Field></div>
  {selected?.type==='IMAGE'&&<div className="campus-map-preview">
   <img src={selected.url} alt="Sơ đồ trường đã chọn"/>
   <button type="button" className="button secondary" onClick={()=>onChange(null)}>Gỡ ảnh sơ đồ</button>
  </div>}
 </section>;
}

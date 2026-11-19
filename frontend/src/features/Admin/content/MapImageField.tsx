import type {UploadedImage} from '@invite/contracts';
import {ImageField} from './ImageField';

export function MapImageField({value,image,onChange}:{value:string|null;image?:UploadedImage|null;onChange:(id:string|null,image:UploadedImage|null)=>void}){
 return <section className="campus-map-field" aria-label="Ảnh sơ đồ trường">
  <h3>Ảnh sơ đồ trường</h3>
  <ImageField label="Chọn ảnh sơ đồ trường" assetId={value} image={image} onChange={onChange}/>
  {(value||image)&&<button type="button" className="button secondary" onClick={()=>onChange(null,null)}>Gỡ ảnh sơ đồ</button>}
 </section>;
}

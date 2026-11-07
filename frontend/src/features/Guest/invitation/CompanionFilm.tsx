import {companionPhotoPath,companionPhotos} from '@invite/contracts';

const rowCount=4;
const filmRows=Array.from({length:rowCount},(_,row)=>companionPhotos.filter((_,index)=>index%rowCount===row)).filter(row=>row.length);

export function CompanionFilm(){
 return <div className="companion-gallery">
  {filmRows.map((photos,index)=><div className="film-row" key={photos[0].id} role="region" aria-label={`Dải ảnh ${index+1} trên ${rowCount}`}>
   <div className="film-track">
    {[false,true].map(copy=><div className="film-strip" key={Number(copy)} aria-hidden={copy||undefined}>
     {photos.map(({id,width,height,smallWidth})=>{
     const path=companionPhotoPath(id);
      const ratio=width/height;
      return <figure key={id}>
       <a href={path+'.webp'} target="_blank" rel="noopener noreferrer" tabIndex={copy?-1:undefined}
        aria-label={copy?undefined:`Xem ảnh ${id} đầy đủ`}>
        <img src={path+'.webp'} srcSet={smallWidth<width?`${path}-small.webp ${smallWidth}w, ${path}.webp ${width}w`:undefined}
         sizes={`(max-width: 767px) ${Math.ceil(110*ratio)}px, ${Math.ceil(176*ratio)}px`}
         width={width} height={height} style={{aspectRatio:`${width} / ${height}`}}
         alt={copy?'':`Ảnh kỷ niệm cùng người đồng hành ${id}`} loading="lazy" decoding="async"/>
       </a>
      </figure>;
     })}
    </div>)}
   </div>
  </div>)}
 </div>;
}

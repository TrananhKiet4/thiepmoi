import {assetIds,staticMedia,type Content,type MediaView} from '../../../packages/contracts/src/index.js';
import {AppError} from '../errors/app-error.js';

function mediaIds(content:Content){
 // Legacy gallery entries remain in revisions. The invitation renders a fixed photo set.
 return assetIds({...content,sections:content.sections.filter(section=>section.type!=='gallery')});
}

export function mediaUrls(content:Content):Record<string,MediaView>{
 const media:Record<string,MediaView>={};
 for(const id of mediaIds(content)){
  const asset=staticMedia[id];
  if(!asset)continue;
  const {originalName,...view}=asset;
  media[id]=view;
 }
 return media;
}

export function validateMedia(content:Content,stage:'draft'|'publish'){
 if(mediaIds(content).some(id=>!staticMedia[id]))throw new AppError(422,'INVALID_MEDIA','Media không có sẵn trong bộ tệp của thiệp');
 if(stage==='draft')return;
 const music=content.music.assetId;
 if(music&&staticMedia[music]?.type!=='AUDIO')throw new AppError(422,'INVALID_MEDIA','Nhạc phải là file âm thanh');
 const imageIds=mediaIds({...content,music:{...content.music,assetId:null}});
 if(imageIds.some(id=>staticMedia[id]?.type!=='IMAGE'))throw new AppError(422,'INVALID_MEDIA','Vị trí ảnh phải dùng ảnh');
}

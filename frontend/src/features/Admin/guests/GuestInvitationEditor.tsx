import {useState} from 'react';
import {Check,Eye} from 'lucide-react';
import {invitationContentSchema,type InvitationView} from '@invite/contracts';
import {ErrorBox,Field,Loading,Modal} from '../../../components/ui/index';
import {useAdmin} from '../../../contexts/AdminContext';
import {useApi} from '../../../lib/api';
import {Invitation} from '../../Guest/invitation/Invitation';

type InvitationContent={personalMessage:string;letterTitle:string;letterMessage:string};
type InvitationGuest={id:string;fullName:string;displayName:string;invitation:InvitationContent&{id:string;version:number}};

export function GuestInvitationEditor({guest,onClose}:{guest:InvitationGuest;onClose:()=>void}){
 const {event,change}=useAdmin();
 const {id,version,personalMessage,letterTitle,letterMessage}=guest.invitation;
 const [form,setForm]=useState({personalMessage,letterTitle:letterTitle??'',letterMessage:letterMessage??''});
 const [preview,setPreview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);
 const current=useApi(`/admin/events/${event.id}/preview?guestId=${guest.id}&source=published`);
 const view=current.data as InvitationView|undefined;
 const letter=view?.content.sections.find(section=>section.type==='invitation');
 const defaults={personalMessage:view?.personalMessage??'',letterTitle:letter?.data.title??'',letterMessage:letter?.data.message??''};

 return <Modal title={`Nội dung thiệp · ${guest.displayName||guest.fullName}`} onClose={onClose}>
  <div className="row wrap">
   <button type="button" className="button secondary" disabled={busy||(!view&&!preview)} onClick={()=>setPreview(!preview)}><Eye size={16}/>{preview?'Quay lại chỉnh sửa':'Xem thiệp đã lưu'}</button>
   {!preview&&view&&<button type="button" className="button secondary" disabled={busy} onClick={()=>setForm({personalMessage:form.personalMessage||defaults.personalMessage,letterTitle:form.letterTitle||defaults.letterTitle,letterMessage:form.letterMessage||defaults.letterMessage})}>Chép nội dung đang hiển thị</button>}
  </div>
  <ErrorBox error={current.error}/>
  {current.isPending&&<Loading/>}
  {preview&&view?<Invitation view={view}/>:<form onSubmit={async e=>{
   e.preventDefault();setBusy(true);setError(null);
   try{
    const data=invitationContentSchema.parse({...form,expectedVersion:version});
    await change(`/admin/invitations/${id}/content`,'PATCH',data);
    onClose();
   }catch(error){setError(error);}finally{setBusy(false);}
  }}>
   <p className="small muted">Ô trống dùng nội dung chung. Thay đổi được cập nhật trên link hiện tại của khách.</p>
   <Field label="Lời mở phong bì"><textarea maxLength={1000} rows={3} value={form.personalMessage} placeholder={defaults.personalMessage} onChange={e=>setForm({...form,personalMessage:e.target.value})}/></Field>
   <Field label="Tiêu đề lời mời"><input maxLength={200} value={form.letterTitle} placeholder={defaults.letterTitle} onChange={e=>setForm({...form,letterTitle:e.target.value})}/></Field>
   <Field label="Nội dung lời mời"><textarea maxLength={2000} rows={5} value={form.letterMessage} placeholder={defaults.letterMessage} onChange={e=>setForm({...form,letterMessage:e.target.value})}/></Field>
   <ErrorBox error={error}/>
   <button type="submit" className="button" disabled={busy}><Check size={16}/>{busy?'Đang lưu…':'Lưu nội dung thiệp'}</button>
  </form>}
 </Modal>;
}

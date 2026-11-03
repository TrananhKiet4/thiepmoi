import {useEffect,useState} from 'react';
import {NavLink,Route,Routes} from 'react-router-dom';
import {useQueryClient} from '@tanstack/react-query';
import {BookOpen,ChevronRight,FileSpreadsheet,GraduationCap,Heart,Image,LayoutDashboard,LogOut,Mail,Menu,Users,X} from 'lucide-react';
import {setCsrf,useApi,write} from '../lib/api';
import {Action,Badge,ErrorBox,Loading} from '../components/ui/index';
import {ContentEditor} from '../features/Admin/content/ContentEditor';
import {MediaLibrary} from '../features/Admin/media/MediaLibrary';
import {Guests} from '../features/Admin/guests/Guests';
import {Imports} from '../features/Admin/imports/Imports';
import {Wishes} from '../features/Admin/wishes/Wishes';
import {Context} from '../contexts/AdminContext';
import {Login} from '../pages/Login';
import {Dashboard} from '../features/Admin/dashboard/Dashboard';

const navigation=[['','Tổng quan',LayoutDashboard],['content','Nội dung',BookOpen],['guests','Khách mời',Users],['media','Thư viện',Image],['imports','Nhập Excel',FileSpreadsheet],['responses','Phản hồi',Mail],['wishes','Lời chúc',Heart]] as const;
export default function Admin(){const cache=useQueryClient(),auth=useApi('/admin/auth/me'),event=useApi('/admin/events/current',!!auth.data),[mobile,setMobile]=useState(false);useEffect(()=>{if(auth.data)setCsrf(auth.data.csrfToken);},[auth.data]);
 if(auth.isPending)return <Loading/>;
 if(!auth.data)return <Login onLogin={()=>void auth.refetch()}/>;
 if(event.isPending)return <Loading/>;
 if(event.error)return <div className="padded"><ErrorBox error={event.error}/><Action run={()=>event.refetch()}>Thử lại</Action></div>;
 async function change(path:string,method:string,body?:unknown,headers?:HeadersInit){const result=await write(path,method,body,undefined,headers);await cache.invalidateQueries();return result;}
 const value={event:event.data,change,refresh:()=>cache.invalidateQueries()};
 return <Context.Provider value={value}><div className="admin-shell"><aside className={'sidebar '+(mobile?'is-open':'')}><div className="sidebar-top"><NavLink className="brand" to="/admin"><span className="brand-icon"><GraduationCap size={25} strokeWidth={1.5}/></span><span>một chặng đường<small>GRADUATION STUDIO</small></span></NavLink><button className="mobile-close icon-button" aria-label="Đóng menu" onClick={()=>setMobile(false)}><X/></button></div><div className="workspace-tag"><span className="tiny-dot"/> KHÔNG GIAN CỦA BẠN</div><nav>{navigation.map(([path,label,Icon])=><NavLink key={path} to={'/admin/'+path} end onClick={()=>setMobile(false)} className={({isActive})=>'nav-item '+(isActive?'active':'')}><Icon size={19} strokeWidth={1.6}/><span>{label}</span>{path==='wishes'&&<span className="nav-star" aria-hidden="true">✧</span>}</NavLink>)}</nav><div className="sidebar-note"><span>✧</span><p>Một dấu mốc mới.<br/>Một kỷ niệm dài lâu.</p></div><div className="sidebar-user"><span className="avatar">{event.data.draft.contentJson.host.fullName[0]||'N'}</span><div><strong>Người tốt nghiệp</strong><small>Quản trị viên</small></div><Action className="icon-button" run={async()=>{await write('/admin/auth/logout','POST');setCsrf('');cache.clear();await auth.refetch();}}><LogOut size={17}/><span className="sr-only">Đăng xuất</span></Action></div></aside>{mobile&&<div className="sidebar-scrim" onClick={()=>setMobile(false)}/>}
 <div className="admin-main"><div className="topbar"><div className="row"><button className="mobile-menu icon-button" aria-label="Mở menu" onClick={()=>setMobile(true)}><Menu/></button><span className="breadcrumb">Không gian quản trị <ChevronRight size={13}/> Lễ tốt nghiệp</span></div><div className="row"><Badge tone={event.data.publishedRevisionId?'green':''}>{event.data.publishedRevisionId?'Đang công bố':'Bản nháp'}</Badge><span className="topbar-star">✧</span></div></div><main className="admin-content"><Routes><Route index element={<Dashboard/>}/><Route path="content" element={<ContentEditor/>}/><Route path="guests" element={<Guests/>}/><Route path="responses" element={<Guests responses/>}/><Route path="media" element={<MediaLibrary/>}/><Route path="imports" element={<Imports/>}/><Route path="wishes" element={<Wishes/>}/><Route path="*" element={<Dashboard/>}/></Routes><footer className="admin-footer"><span>ĐƯỢC TẠO NÊN TỪ NHỮNG ĐIỀU ĐÁNG NHỚ.</span><span>một chặng đường ✧</span></footer></main></div></div></Context.Provider>;
}

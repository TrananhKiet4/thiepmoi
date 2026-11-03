import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GraduationCap, ArrowUpRight } from 'lucide-react';
import { Loading } from './ui';
import './style.css';
const Admin=lazy(()=>import('./Admin')), Guest=lazy(()=>import('./Invitation'));
const client=new QueryClient({defaultOptions:{queries:{staleTime:0,refetchOnWindowFocus:false}}});
function Home(){return <main className="home"><div className="brand"><GraduationCap/> một chặng đường</div><p className="eyebrow">GRADUATION INVITATION</p><h1>Khép lại một chương.<br/><em>Mở ra muôn điều.</em></h1><p>Một ngày đặc biệt, dành cho những người đặc biệt.<br/>Mở đường dẫn riêng được gửi đến bạn để xem lời mời.</p><Link className="button" to="/admin">Không gian quản trị <ArrowUpRight size={18}/></Link><div className="home-bottom">NHỮNG ĐIỀU ĐẸP ĐẼ LUÔN BẮT ĐẦU TỪ MỘT LỜI HẸN. ✧</div></main>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={client}><BrowserRouter><Suspense fallback={<Loading/>}><Routes><Route path="/admin/*" element={<Admin/>}/><Route path="/i/:token" element={<Guest/>}/><Route path="*" element={<Home/>}/></Routes></Suspense></BrowserRouter></QueryClientProvider></React.StrictMode>);

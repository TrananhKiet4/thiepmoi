import {lazy,Suspense} from 'react';
import {Routes,Route} from 'react-router-dom';
import {Loading} from '../components/ui/index';
import {Home} from '../pages/Home';

const Admin=lazy(()=>import("../layouts/AdminLayout")),Guest=lazy(()=>import("../features/Guest/invitation/Invitation"));
export function AppRoutes(){return <Suspense fallback={<Loading/>}><Routes><Route path="/admin/*" element={<Admin/>}/><Route path="/i/:token/:guestName?" element={<Guest/>}/><Route path="*" element={<Home/>}/></Routes></Suspense>;}

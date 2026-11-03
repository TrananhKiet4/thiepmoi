import {Link} from 'react-router-dom';
import {GraduationCap,ArrowUpRight} from 'lucide-react';

export function Home(){return <main className="home"><div className="brand"><GraduationCap/> một chặng đường</div><p className="eyebrow">GRADUATION INVITATION</p><h1>Khép lại một chương.<br/><em>Mở ra muôn điều.</em></h1><p>Một ngày đặc biệt, dành cho những người đặc biệt.<br/>Mở đường dẫn riêng được gửi đến bạn để xem lời mời.</p><Link className="button" to="/admin">Không gian quản trị <ArrowUpRight size={18}/></Link><div className="home-bottom">NHỮNG ĐIỀU ĐẸP ĐẼ LUÔN BẮT ĐẦU TỪ MỘT LỜI HẸN. ✧</div></main>;}

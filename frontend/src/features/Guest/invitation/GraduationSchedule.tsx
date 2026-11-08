import type {Content} from '@invite/contracts';
import {CalendarDays, Clock3, MapPin, Phone} from 'lucide-react';
import {useEffect, useState} from 'react';
import './graduation-schedule.css';

const timeZone = 'Asia/Ho_Chi_Minh';
const fullDate = new Intl.DateTimeFormat('vi-VN', {dateStyle: 'full', timeZone});
const shortDate = new Intl.DateTimeFormat('vi-VN', {day: '2-digit', month: '2-digit', year: 'numeric', timeZone});
const timeOfDay = new Intl.DateTimeFormat('vi-VN', {hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone});
const monthAndYear = new Intl.DateTimeFormat('vi-VN', {month: 'long', year: 'numeric', timeZone});
const dateParts = new Intl.DateTimeFormat('en', {year: 'numeric', month: '2-digit', day: '2-digit', timeZone});
const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export function GraduationSchedule({ceremony, phone, facebookUrl}: {
  ceremony: Content['ceremony'];
  phone?: string;
  facebookUrl?: string;
}) {
  const start = Date.parse(ceremony.startAt);
  const end = Date.parse(ceremony.endAt);
  const hasStart = Number.isFinite(start);
  const hasEnd = end > start;
  const spansDays = hasEnd && shortDate.format(start) !== shortDate.format(end);
  const phoneNumber = phone?.replace(/[\s().-]/g, '') ?? '';

  return <section className="graduation-schedule" aria-label="Lịch lễ tốt nghiệp">
    <div className="graduation-schedule__calendar">
      <p className="graduation-schedule__eyebrow">Ngày lễ tốt nghiệp</p>
      {hasStart ? <>
        <h3 className="graduation-schedule__date"><time dateTime={ceremony.startAt}>{fullDate.format(start)}</time></h3>
        <MonthCalendar start={start}/>
        <Countdown key={start} start={start}/>
      </> : <p className="graduation-schedule__pending">Ngày lễ đang được cập nhật.</p>}
    </div>

    <div className="graduation-schedule__note">
      <p className="graduation-schedule__eyebrow">Save the date</p>
      <h3>Lưu lại ngày này</h3>
      <dl>
        {hasStart && <>
          <div>
            <dt><CalendarDays aria-hidden="true" size={17}/> Ngày</dt>
            <dd><time dateTime={ceremony.startAt}>{fullDate.format(start)}</time></dd>
          </div>
          <div>
            <dt><Clock3 aria-hidden="true" size={17}/> Giờ Việt Nam</dt>
            <dd><time dateTime={ceremony.startAt}>{timeOfDay.format(start)}</time>{hasEnd && <> – <time dateTime={ceremony.endAt}>{timeOfDay.format(end)}{spansDays && ` (${shortDate.format(end)})`}</time></>}</dd>
          </div>
        </>}
        <div>
          <dt><MapPin aria-hidden="true" size={17}/> Địa điểm</dt>
          <dd>{ceremony.venueName && <strong>{ceremony.venueName}</strong>}{ceremony.address}{!ceremony.venueName && !ceremony.address && 'Đang cập nhật'}</dd>
        </div>
        {(phone || facebookUrl) && <div>
          <dt><Phone aria-hidden="true" size={17}/> Liên hệ</dt>
          {phone && <dd>{/^\+?\d+$/.test(phoneNumber) ? <a href={`tel:${phoneNumber}`}>{phone}</a> : phone}</dd>}
          {facebookUrl && <dd><a href={facebookUrl} target="_blank" rel="noopener noreferrer">Facebook</a></dd>}
        </div>}
      </dl>
    </div>
  </section>;
}

function MonthCalendar({start}: {start: number}) {
  const parts = Object.fromEntries(dateParts.formatToParts(start).map(({type, value}) => [type, value]));
  const eventDay = Number(parts.day);
  const localDate = `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`;
  const calendarDate = new Date(0);
  calendarDate.setUTCFullYear(Number(parts.year), Number(parts.month) - 1, 1);
  const leadingCells = (calendarDate.getUTCDay() + 6) % 7;
  calendarDate.setUTCMonth(Number(parts.month), 0);
  const daysInMonth = calendarDate.getUTCDate();
  const weekCount = Math.ceil((leadingCells + daysInMonth) / 7);

  return <table className="graduation-schedule__month" aria-label="Lịch lễ tốt nghiệp trong tháng">
    <caption>{monthAndYear.format(start)}</caption>
    <thead><tr>{weekdays.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
    <tbody>{Array.from({length: weekCount}, (_, week) => <tr key={week}>
      {weekdays.map((label, column) => {
        const day = week * 7 + column - leadingCells + 1;
        return <td key={label}>{day === eventDay
          ? <time dateTime={localDate} data-event-day>{day}<span className="sr-only">, ngày lễ tốt nghiệp</span></time>
          : day > 0 && day <= daysInMonth ? day : null}</td>;
      })}
    </tr>)}</tbody>
  </table>;
}

function secondsUntil(start: number) {
  return Math.max(0, Math.ceil((start - Date.now()) / 1000));
}

function Countdown({start}: {start: number}) {
  const [seconds, setSeconds] = useState(() => secondsUntil(start));
  useEffect(() => {
    const initial = secondsUntil(start);
    setSeconds(initial);
    if (!initial) return;
    const interval = window.setInterval(() => {
      const next = secondsUntil(start);
      setSeconds(next);
      if (!next) window.clearInterval(interval);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [start]);

  return <div className="graduation-schedule__countdown" role="timer" aria-live="off" aria-label="Đếm ngược đến lễ tốt nghiệp">
    <p>{seconds ? 'Đếm ngược đến buổi lễ' : 'Đã đến giờ làm lễ'}</p>
    <ul>
      {([
        ['Ngày', Math.floor(seconds / 86400)],
        ['Giờ', Math.floor(seconds / 3600) % 24],
        ['Phút', Math.floor(seconds / 60) % 60],
        ['Giây', seconds % 60],
      ] as const).map(([label, value]) => <li key={label}><strong>{String(value).padStart(2, '0')}</strong>{label}</li>)}
    </ul>
  </div>;
}

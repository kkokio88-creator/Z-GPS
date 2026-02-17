import React, { useEffect, useState } from 'react';
import Header from './Header';
import { getCalendarEvents } from '../services/calendarService';
import { CalendarEvent } from '../types';

const CalendarView: React.FC = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    setEvents(getCalendarEvents());
  }, []);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed
  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  
  const calendarDays = [];
  // Add empty slots for days before the first day of the month
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }
  // Add actual days
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i);
  }

  // Filter events for current month
  const currentMonthEvents = events.filter(e => {
      const eDate = new Date(e.date);
      return eDate.getFullYear() === year && eDate.getMonth() === month;
  });

  return (
    <div className="flex flex-col h-full">
      <Header title="일정 관리 (Calendar)" actionLabel="구글 캘린더 동기화" icon="sync" onAction={() => alert("동기화 완료")} />
      
      <main className="flex-1 overflow-y-auto p-8 z-10 relative">
        <div className="absolute inset-0 bg-grid-pattern pointer-events-none z-0 opacity-40"></div>
        <div className="relative z-10 max-w-7xl mx-auto">
            
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Upcoming List View */}
                <div className="w-full lg:w-1/3 space-y-4">
                    <h3 className="font-bold text-lg mb-4 flex items-center">
                        <span className="material-icons-outlined mr-2" aria-hidden="true">event_available</span>
                        다가오는 마감일정 (전체)
                    </h3>
                    
                    {events.length === 0 && (
                        <div className="bg-white dark:bg-surface-dark p-6 rounded-lg text-center text-gray-500 border border-border-light dark:border-border-dark">
                            등록된 일정이 없습니다.<br/>
                            지원사업 신청 화면에서 '캘린더 연동'을 진행해주세요.
                        </div>
                    )}

                    {events
                        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                        .map(evt => {
                            const dDay = Math.ceil((new Date(evt.date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                            const isPast = dDay < 0;
                            return (
                                <div key={evt.id} className={`bg-white dark:bg-surface-dark p-4 rounded-lg shadow-sm border-l-4 ${isPast ? 'border-l-gray-400 opacity-60' : 'border-l-primary'} border-t border-r border-b border-border-light dark:border-border-dark`}>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${evt.type === 'INTERNAL' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                                                {evt.type === 'INTERNAL' ? '내부 마감' : '공식 마감'}
                                            </span>
                                            <h4 className="font-medium mt-2 text-sm text-text-main-light dark:text-text-main-dark line-clamp-2">{evt.programName}</h4>
                                        </div>
                                        <div className={`text-center p-2 rounded min-w-[60px] ${isPast ? 'bg-gray-100 dark:bg-gray-800' : 'bg-green-50 dark:bg-green-900/30'}`}>
                                            <span className="block text-xs text-text-sub-light">{isPast ? '종료' : `D-${dDay}`}</span>
                                            <span className="block text-lg font-bold text-text-main-light dark:text-text-main-dark">
                                                {new Date(evt.date).getDate()}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-xs text-text-sub-light flex items-center">
                                        <span className="material-icons-outlined text-xs mr-1" aria-hidden="true">calendar_today</span>
                                        {evt.date}
                                    </div>
                                </div>
                            );
                        })}
                </div>

                {/* Calendar Grid (Interactive) */}
                <div className="flex-1 bg-white dark:bg-surface-dark p-6 rounded-lg shadow-sm border border-border-light dark:border-border-dark">
                     <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-text-main-light dark:text-text-main-dark">
                            {year}년 {month + 1}월
                        </h2>
                        <div className="flex space-x-2">
                             <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-text-main-light dark:text-text-main-dark">
                                 <span className="material-icons-outlined" aria-hidden="true">chevron_left</span>
                             </button>
                             <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-text-main-light dark:text-text-main-dark">
                                 오늘
                             </button>
                             <button onClick={handleNextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-text-main-light dark:text-text-main-dark">
                                 <span className="material-icons-outlined" aria-hidden="true">chevron_right</span>
                             </button>
                        </div>
                     </div>
                     
                     <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                         {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                             <div key={d} className={`bg-gray-50 dark:bg-gray-800 p-2 text-center text-xs font-bold ${i === 0 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                                 {d}
                             </div>
                         ))}
                         
                         {calendarDays.map((day, idx) => {
                             if (day === null) {
                                 return <div key={`empty-${idx}`} className="bg-white dark:bg-gray-900 min-h-[120px]"></div>;
                             }
                             
                             const dayEvents = currentMonthEvents.filter(e => new Date(e.date).getDate() === day);
                             const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();

                             return (
                                 <div key={day} className={`bg-white dark:bg-surface-dark min-h-[120px] p-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors relative group border-t border-gray-100 dark:border-gray-800`}>
                                     <span className={`text-sm font-medium inline-block w-7 h-7 leading-7 text-center rounded-full ${isToday ? 'bg-primary text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                                         {day}
                                     </span>
                                     <div className="mt-1 space-y-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                                         {dayEvents.map(e => (
                                             <div 
                                                key={e.id} 
                                                className={`text-[10px] p-1.5 rounded truncate shadow-sm cursor-pointer hover:opacity-80 transition-opacity text-white ${
                                                    e.type === 'INTERNAL' ? 'bg-red-500' : 'bg-blue-500'
                                                }`}
                                                title={e.programName}
                                             >
                                                 {e.programName}
                                             </div>
                                         ))}
                                     </div>
                                 </div>
                             );
                         })}
                     </div>
                </div>
            </div>

        </div>
      </main>
    </div>
  );
};

export default CalendarView;
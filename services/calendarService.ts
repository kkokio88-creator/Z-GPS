import { CalendarEvent, SupportProgram } from "../types";
import { getStoredCalendarEvents, saveStoredCalendarEvents } from "./storageService";

// Helper to generate Google Calendar Web Intent URL
const createGoogleCalendarUrl = (title: string, dateStr: string, details: string): string => {
  // Format date to YYYYMMDD
  const date = dateStr.replace(/-/g, '');
  // Start and End date are the same for a deadline (all day event)
  const dates = `${date}/${date}`;
  
  const baseUrl = "https://calendar.google.com/calendar/render";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: dates,
    details: details,
  });

  return `${baseUrl}?${params.toString()}`;
};

// Simulate Google Calendar MCP Agent
export const syncDeadlinesToCalendar = async (program: SupportProgram): Promise<CalendarEvent[]> => {
  // Simulate API/Agent delay
  await new Promise(resolve => setTimeout(resolve, 800));

  const events: CalendarEvent[] = [
    {
      id: `evt_int_${program.id}`,
      title: `[Z-GPS/내부마감] ${program.programName}`,
      date: program.internalDeadline,
      type: 'INTERNAL',
      programName: program.programName
    },
    {
      id: `evt_off_${program.id}`,
      title: `[Z-GPS/공식마감] ${program.programName}`,
      date: program.officialEndDate,
      type: 'OFFICIAL',
      programName: program.programName
    }
  ];

  // Save to persistent storage
  saveStoredCalendarEvents(events);

  return events;
};

export const getGoogleCalendarUrlForProgram = (program: SupportProgram, type: 'INTERNAL' | 'OFFICIAL'): string => {
  const isInternal = type === 'INTERNAL';
  const title = isInternal ? `🚨 [내부마감] ${program.programName}` : `📅 [공식마감] ${program.programName}`;
  const date = isInternal ? program.internalDeadline : program.officialEndDate;
  const details = `[Z-GPS 지원사업 관리]\n\n사업명: ${program.programName}\n주관기관: ${program.organizer}\n\n지원서 작성을 완료하고 제출해야 합니다.`;

  return createGoogleCalendarUrl(title, date, details);
};

export const getCalendarEvents = (): CalendarEvent[] => {
  return getStoredCalendarEvents();
};
// DECISION: the blog pages import `@/lib/utils` while the helpers actually
// live in `@/lib/utils/persian.ts`. This thin re-export keeps both import
// paths working without touching the blog pages.
export { toPersianDigits, formatDate, type CalendarFormat, CALENDAR_FORMATS, CALENDAR_LABELS, DEFAULT_CALENDAR } from './utils/persian';

'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import {
  formatDate,
  CALENDAR_FORMATS,
  DEFAULT_CALENDAR,
  type CalendarFormat,
} from '@/lib/utils/persian';

/**
 * Spec F.8 / user request — one calendar for the whole app.
 *
 * DECISION: the calendar preference lives in the user's `settingsJson.calendar`
 * (persisted via PATCH /users/me from the Settings page) and the default is
 * `persian` (Jalali / شمسی). Every UI date should render through `useCalendar()`
 * → `format(...)` so the user's choice is honored in one place rather than the
 * per-page `toLocaleDateString('fa-IR')` calls.
 *
 * The preference is read-only here: the Settings page is the only writer, and it
 * invalidates the `me-settings` query (the same key this provider watches), so a
 * save immediately re-renders every date on screen.
 */

interface CalendarContextValue {
  /** The active calendar ('persian' | 'qamari' | 'gregorian'). */
  format: CalendarFormat;
  /** Format a date in the active calendar, with Persian digits. */
  formatDate: (date: Date | string, withTime?: boolean) => string;
  /** Whether the user is signed in (drives whether we fetch the preference). */
  ready: boolean;
}

const CalendarContext = createContext<CalendarContextValue | null>(null);

/**
 * Read the user's chosen calendar + a bound formatter.
 *
 * Throws if used outside `<CalendarProvider>` — a hard failure beats silently
 * showing the wrong calendar.
 */
export function useCalendar(): CalendarContextValue {
  const ctx = useContext(CalendarContext);
  if (!ctx) {
    throw new Error('useCalendar must be used within <CalendarProvider>');
  }
  return ctx;
}

export function CalendarProvider({ children }: { children: ReactNode }) {
  // Only fetch the preference once the client has a token (api client throws
  // 401 otherwise). `me-settings` is the shared key the Settings page writes to.
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setHasToken(Boolean(window.localStorage.getItem('token')));
  }, []);

  const meQuery = useQuery({
    queryKey: ['me-settings'],
    enabled: hasToken,
    staleTime: Infinity, // the Settings page invalidates this on save
    queryFn: async () =>
      api.get<{ settingsJson?: Record<string, unknown> | null }>('/users/me'),
  });

  const raw = (meQuery.data?.settingsJson ?? {}) as Record<string, unknown>;
  const stored = typeof raw.calendar === 'string' ? raw.calendar : null;
  const format: CalendarFormat =
    stored && (CALENDAR_FORMATS as string[]).includes(stored)
      ? (stored as CalendarFormat)
      : DEFAULT_CALENDAR;

  return (
    <CalendarContext.Provider
      value={{
        format,
        formatDate: (date, withTime = false) => formatDate(date, format, withTime),
        ready: hasToken || !meQuery.isLoading,
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
}

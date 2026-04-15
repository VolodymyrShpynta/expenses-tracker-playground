export interface DateRange {
  from: Date;
  to: Date;
}

export type PresetKey = 'range' | 'all' | 'day' | 'week' | 'today' | 'year' | 'month';

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function getLocaleWeekStart(): number {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      weekInfo?: { firstDay: number };
      getWeekInfo?: () => { firstDay: number };
    };
    const info = locale.weekInfo ?? locale.getWeekInfo?.();
    if (info) return info.firstDay % 7; // Intl uses 1=Mon…7=Sun → convert 7 to 0
  } catch (e) { console.warn('Intl.Locale weekInfo unavailable', e); }
  return 0; // fallback: Sunday
}

export function buildWeekRange(): DateRange {
  const now = new Date();
  const weekStart = getLocaleWeekStart();
  const day = now.getDay(); // 0=Sun
  const diff = (day - weekStart + 7) % 7;
  const from = new Date(now);
  from.setDate(now.getDate() - diff);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  return { from: startOfDay(from), to: endOfDay(to) };
}

export function buildMonthRange(): DateRange {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

export function buildYearRange(): DateRange {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), 0, 1),
    to: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
  };
}

export function buildTodayRange(): DateRange {
  const now = new Date();
  return { from: startOfDay(now), to: endOfDay(now) };
}

export function buildAllTimeRange(): DateRange {
  return {
    from: new Date(2000, 0, 1),
    to: endOfDay(new Date()),
  };
}

const PRESET_STORAGE_KEY = 'expenses-tracker-period-preset';
const VALID_PRESETS: PresetKey[] = ['range', 'all', 'day', 'week', 'today', 'year', 'month'];

export function readStoredPreset(userId?: string): PresetKey {
  const key = userId ? `${PRESET_STORAGE_KEY}:${userId}` : PRESET_STORAGE_KEY;
  try {
    const stored = localStorage.getItem(key);
    if (stored && VALID_PRESETS.includes(stored as PresetKey)) return stored as PresetKey;
  } catch (e) { console.warn('Failed to read period preset from localStorage', e); }
  return 'year';
}

export function savePreset(key: PresetKey, userId?: string): void {
  const storageKey = userId ? `${PRESET_STORAGE_KEY}:${userId}` : PRESET_STORAGE_KEY;
  try { localStorage.setItem(storageKey, key); }
  catch (e) { console.warn('Failed to save period preset to localStorage', e); }
}

export function buildRangeForPreset(key: PresetKey): DateRange {
  switch (key) {
    case 'week': return buildWeekRange();
    case 'month': return buildMonthRange();
    case 'today': return buildTodayRange();
    case 'all': return buildAllTimeRange();
    default: return buildYearRange();
  }
}

export function formatShort(d: Date): string {
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

export function formatRange(range: DateRange): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const from = range.from.toLocaleDateString('en-US', opts).toUpperCase();
  const to = range.to.toLocaleDateString('en-US', opts).toUpperCase();
  return `${from} – ${to}`;
}

export { startOfDay, endOfDay };

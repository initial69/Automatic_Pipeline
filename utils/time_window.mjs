// utils/time_window.mjs
// Swiss timezone utilities (Europe/Zurich)

export function cutoffMs24h() {
  return Date.now() - 24 * 60 * 60 * 1000;
}

export function localISO(date) {
  // Convert to Swiss timezone and format as ISO-like string
  const swissTimeStr = date.toLocaleString("sv-SE", {timeZone: "Europe/Zurich"});
  return swissTimeStr.replace('T', ' ');
}

export function swissTime() {
  // Get current time in Swiss timezone
  return new Date().toLocaleString("en-US", {timeZone: "Europe/Zurich"});
}

export function toSwissTime(date) {
  // Convert any date to Swiss timezone
  return new Date(date.toLocaleString("en-US", {timeZone: "Europe/Zurich"}));
}

export function parseDateFlexible(x) {
  if (!x) return NaN;
  if (x instanceof Date) return x.getTime();
  if (typeof x === 'number') return x < 2e10 ? x * 1000 : x;
  if (typeof x === 'string') {
    const t = Date.parse(x.trim());
    if (!Number.isNaN(t)) return t;
  }
  return NaN;
}

export function isWithin(ts, cutoff) {
  return !Number.isNaN(ts) && ts >= cutoff;
}


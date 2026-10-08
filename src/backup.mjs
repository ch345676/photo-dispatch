export const BACKUP_INTERVAL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

function isoTime(value) {
  if (typeof value !== "string") return NaN;
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!parts) return NaN;
  const [, year, month, day, hour, minute, second] = parts.map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > monthDays[month - 1] ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    return NaN;
  return Date.parse(value);
}

export function normalizeBackupMeta(value, now = Date.now()) {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const result = { lastExportedAt: "", lastRestoredAt: "", snoozedUntil: "" };
  for (const key of Object.keys(result)) {
    const time = isoTime(source[key]);
    const valid =
      Number.isFinite(time) &&
      (key === "snoozedUntil"
        ? time > now && time <= now + DAY_MS
        : time <= now);
    if (valid) result[key] = new Date(time).toISOString();
  }
  return result;
}

export function nextBackupReminder(now = Date.now()) {
  const nextDay = Math.floor((now + BEIJING_OFFSET_MS) / DAY_MS) + 1;
  return new Date(nextDay * DAY_MS - BEIJING_OFFSET_MS).toISOString();
}

export function backupStatus(data, mode, metadata, now = Date.now()) {
  const meta = normalizeBackupMeta(metadata, now);
  const hasData = ["orders", "partners", "venues", "trash"].some(
    (key) => Array.isArray(data?.[key]) && data[key].length > 0,
  );
  let reason;
  if (mode === "demo") reason = "demo";
  else if (!hasData) reason = "empty";
  else if (!meta.lastExportedAt) reason = "never";
  else if (
    meta.lastRestoredAt &&
    Date.parse(meta.lastRestoredAt) >= Date.parse(meta.lastExportedAt)
  )
    reason = "restored";
  else if (
    now - Date.parse(meta.lastExportedAt) >=
    BACKUP_INTERVAL_DAYS * DAY_MS
  )
    reason = "stale";
  else reason = "recent";

  const due = ["never", "restored", "stale"].includes(reason);
  return {
    reason,
    due,
    show: due && !meta.snoozedUntil,
    lastExportedAt: meta.lastExportedAt,
    snoozedUntil: meta.snoozedUntil,
  };
}

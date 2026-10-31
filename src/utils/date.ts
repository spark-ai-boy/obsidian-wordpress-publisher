import type { ResolvedLanguage } from "../types";

export function nowIso(): string {
  return new Date().toISOString();
}

/** Convert a datetime-local input value to the format expected by WordPress. */
export function toWordPressDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const normalized = trimmed.replace(" ", "T");
  if (normalized.length === 16) {
    return `${normalized}:00`;
  }
  return normalized.slice(0, 19);
}

export function toDateTimeLocal(value?: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function defaultScheduleValue(): string {
  return toDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000).toISOString());
}

export function isValidSchedule(value: string): boolean {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

export function isFutureSchedule(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now() + 30_000;
}

export function formatDateTime(
  value: string | undefined,
  language: ResolvedLanguage,
  includeTime = true
): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const locale = language === "zh" ? "zh-CN" : "en-US";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      ...(includeTime ? { timeStyle: "short" } : {})
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

/**
 * WordPress returns `modified` in site-local time without a timezone suffix.
 * Comparing strings is only safe for the same site, which is the use case here.
 */
export function remoteChangedSince(
  remoteModified: string | undefined,
  lastSync: string | undefined
): boolean {
  if (!remoteModified || !lastSync) {
    return false;
  }
  const remote = new Date(remoteModified).getTime();
  const local = new Date(lastSync).getTime();
  if (Number.isNaN(remote) || Number.isNaN(local)) {
    return false;
  }
  return remote > local + 60_000;
}

/**
 * Prefer comparing the stored remote modified timestamp, which avoids timezone
 * ambiguity between the site and the user's machine.
 */
export function remoteChanged(
  remoteModified: string | undefined,
  storedRemoteModified: string | undefined,
  lastSync: string | undefined
): boolean {
  if (!remoteModified) {
    return false;
  }
  if (storedRemoteModified) {
    return remoteModified !== storedRemoteModified;
  }
  return remoteChangedSince(remoteModified, lastSync);
}

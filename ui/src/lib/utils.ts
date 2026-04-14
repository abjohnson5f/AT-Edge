import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(cents: number | undefined | null): string {
  if (cents == null) return "$0.00";
  return "$" + (cents / 100).toFixed(2);
}

// Parse date strings as local time, not UTC.
// "2026-04-15" via new Date() is UTC midnight, which rolls back a day in US timezones.
function parseLocalDate(dateString: string): Date {
  // Date-only: "2026-04-15" or "04/15/2026"
  const isoMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3]);
  }
  // Date + time without timezone: "2026-04-15 19:00:00"
  const dtMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (dtMatch) {
    return new Date(+dtMatch[1], +dtMatch[2] - 1, +dtMatch[3], +dtMatch[4], +dtMatch[5], +(dtMatch[6] ?? 0));
  }
  return new Date(dateString);
}

export function formatDateTime(dateString: string | undefined | null): string {
  if (!dateString) return "";
  try {
    return format(parseLocalDate(dateString), "MM/dd/yyyy h:mm a");
  } catch (e) {
    return dateString;
  }
}

export function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return "";
  try {
    return format(parseLocalDate(dateString), "MM/dd/yyyy");
  } catch (e) {
    return dateString;
  }
}

export function formatTime(timeString: string | undefined | null): string {
  if (!timeString) return "";
  try {
    if (timeString.length === 5 && timeString.includes(":")) {
      const [hours, minutes] = timeString.split(":");
      const date = new Date();
      date.setHours(parseInt(hours, 10), parseInt(minutes, 10));
      return format(date, "h:mm a");
    }
    return format(parseLocalDate(timeString), "h:mm a");
  } catch (e) {
    return timeString;
  }
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

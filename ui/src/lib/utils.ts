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

export function formatDateTime(dateString: string | undefined | null): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    return format(date, "MM/dd/yyyy h:mm a");
  } catch (e) {
    return dateString;
  }
}

export function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    return format(date, "MM/dd/yyyy");
  } catch (e) {
    return dateString;
  }
}

export function formatTime(timeString: string | undefined | null): string {
  if (!timeString) return "";
  try {
    // If it's just HH:mm
    if (timeString.length === 5 && timeString.includes(":")) {
      const [hours, minutes] = timeString.split(":");
      const date = new Date();
      date.setHours(parseInt(hours, 10), parseInt(minutes, 10));
      return format(date, "h:mm a");
    }
    const date = new Date(timeString);
    return format(date, "h:mm a");
  } catch (e) {
    return timeString;
  }
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

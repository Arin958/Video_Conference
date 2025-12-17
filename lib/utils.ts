import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateRandomId(): string {
  return `user_${Math.random().toString(36).substring(2, 9)}`;
}


export function getGridCols(count: number): string {
  if (count === 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-2";
  if (count <= 4) return "grid-cols-2 md:grid-cols-2";
  if (count <= 6) return "grid-cols-3 md:grid-cols-3";
  if (count <= 9) return "grid-cols-3 md:grid-cols-3 lg:grid-cols-3";
  if (count <= 12) return "grid-cols-4 md:grid-cols-4 lg:grid-cols-4";
  return "grid-cols-4 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4";
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
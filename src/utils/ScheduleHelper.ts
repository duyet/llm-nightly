/**
 * ScheduleHelper - Utilities for schedule configuration
 */
import type { ExtendedTaskConfig } from "@/types";

export interface ScheduleCheckResult {
  canExecute: boolean;
  reason?: string;
  nextAvailableTime?: Date;
}

export class ScheduleHelper {
  /**
   * Check if current time is within schedule constraints
   */
  static checkSchedule(
    scheduling?: ExtendedTaskConfig["scheduling"],
    currentTime: Date = new Date(),
  ): ScheduleCheckResult {
    if (!scheduling) {
      return { canExecute: true };
    }

    // Check notBefore
    if (scheduling.notBefore) {
      const notBefore = new Date(scheduling.notBefore);
      if (currentTime < notBefore) {
        return {
          canExecute: false,
          reason: `Not before ${notBefore.toISOString()}`,
          nextAvailableTime: notBefore,
        };
      }
    }

    // Check notAfter
    if (scheduling.notAfter) {
      const notAfter = new Date(scheduling.notAfter);
      if (currentTime > notAfter) {
        return {
          canExecute: false,
          reason: `Not after ${notAfter.toISOString()}`,
        };
      }
    }

    // Check days of week
    if (scheduling.daysOfWeek && scheduling.daysOfWeek.length > 0) {
      const currentDay = currentTime.getDay();
      if (!scheduling.daysOfWeek.includes(currentDay)) {
        const nextDay = this.getNextAvailableDay(
          currentDay,
          scheduling.daysOfWeek,
        );
        return {
          canExecute: false,
          reason: `Not scheduled for this day of week (${currentDay})`,
          nextAvailableTime: this.getNextDayTime(currentTime, nextDay),
        };
      }
    }

    // Check time windows
    if (
      scheduling.preferredTimeWindows &&
      scheduling.preferredTimeWindows.length > 0
    ) {
      const inWindow = this.isInTimeWindow(
        currentTime,
        scheduling.preferredTimeWindows,
      );
      if (!inWindow.result) {
        return {
          canExecute: false,
          reason: "Outside preferred time windows",
          nextAvailableTime: inWindow.nextWindow,
        };
      }
    }

    return { canExecute: true };
  }

  /**
   * Check if current time is within any of the time windows
   */
  private static isInTimeWindow(
    currentTime: Date,
    windows: Array<{
      startTime: string;
      endTime: string;
      timezone?: string;
    }>,
  ): { result: boolean; nextWindow?: Date } {
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;

    for (const window of windows) {
      const [startHour, startMinute] = window.startTime.split(":").map(Number);
      const [endHour, endMinute] = window.endTime.split(":").map(Number);

      const startMinutes = startHour * 60 + startMinute;
      const endMinutes = endHour * 60 + endMinute;

      // Handle windows that cross midnight
      if (endMinutes < startMinutes) {
        if (
          currentTimeMinutes >= startMinutes ||
          currentTimeMinutes <= endMinutes
        ) {
          return { result: true };
        }
      } else {
        if (
          currentTimeMinutes >= startMinutes &&
          currentTimeMinutes <= endMinutes
        ) {
          return { result: true };
        }
      }
    }

    // Calculate next available window
    const nextWindow = this.getNextTimeWindow(currentTime, windows);
    return { result: false, nextWindow };
  }

  /**
   * Get next available time window
   */
  private static getNextTimeWindow(
    currentTime: Date,
    windows: Array<{ startTime: string; endTime: string }>,
  ): Date {
    const today = new Date(currentTime);
    today.setSeconds(0);
    today.setMilliseconds(0);

    let nearestWindow: Date | null = null;

    for (const window of windows) {
      const [startHour, startMinute] = window.startTime.split(":").map(Number);

      const windowStart = new Date(today);
      windowStart.setHours(startHour, startMinute, 0, 0);

      if (windowStart > currentTime) {
        if (!nearestWindow || windowStart < nearestWindow) {
          nearestWindow = windowStart;
        }
      }
    }

    // If no window today, use first window tomorrow
    if (!nearestWindow) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const [startHour, startMinute] = windows[0].startTime
        .split(":")
        .map(Number);
      tomorrow.setHours(startHour, startMinute, 0, 0);
      return tomorrow;
    }

    return nearestWindow;
  }

  /**
   * Get next available day from list of allowed days
   */
  private static getNextAvailableDay(
    currentDay: number,
    allowedDays: number[],
  ): number {
    const sorted = [...allowedDays].sort((a, b) => a - b);

    // Find next day in sorted list
    for (const day of sorted) {
      if (day > currentDay) {
        return day;
      }
    }

    // Wrap around to first day of next week
    return sorted[0];
  }

  /**
   * Get date/time for next available day
   */
  private static getNextDayTime(currentTime: Date, targetDay: number): Date {
    const result = new Date(currentTime);
    const currentDay = currentTime.getDay();

    let daysToAdd = targetDay - currentDay;
    if (daysToAdd <= 0) {
      daysToAdd += 7;
    }

    result.setDate(result.getDate() + daysToAdd);
    result.setHours(0, 0, 0, 0);

    return result;
  }

  /**
   * Calculate next execution time for recurring tasks
   */
  static getNextRecurringTime(
    lastExecutionTime: Date,
    recurring: NonNullable<ExtendedTaskConfig["scheduling"]>["recurring"],
  ): Date | null {
    if (!recurring) return null;

    const next = new Date(lastExecutionTime);

    switch (recurring.frequency) {
      case "daily":
        next.setDate(next.getDate() + recurring.interval);
        break;
      case "weekly":
        next.setDate(next.getDate() + recurring.interval * 7);
        break;
      case "monthly":
        next.setMonth(next.getMonth() + recurring.interval);
        break;
    }

    // Check if past until date
    if (recurring.until) {
      const until = new Date(recurring.until);
      if (next > until) {
        return null; // Recurring schedule has ended
      }
    }

    return next;
  }

  /**
   * Check if task should execute based on recurring schedule
   */
  static shouldExecuteRecurring(
    lastExecutionTime: Date | null,
    scheduling?: ExtendedTaskConfig["scheduling"],
    currentTime: Date = new Date(),
  ): boolean {
    if (!scheduling?.recurring || !lastExecutionTime) {
      return true; // No recurring schedule or first execution
    }

    const nextTime = this.getNextRecurringTime(
      lastExecutionTime,
      scheduling.recurring,
    );

    if (!nextTime) {
      return false; // Recurring schedule has ended
    }

    return currentTime >= nextTime;
  }

  /**
   * Format schedule for display
   */
  static formatSchedule(scheduling?: ExtendedTaskConfig["scheduling"]): string {
    if (!scheduling) {
      return "No schedule constraints";
    }

    const parts: string[] = [];

    if (scheduling.notBefore) {
      parts.push(
        `Not before: ${new Date(scheduling.notBefore).toLocaleString()}`,
      );
    }

    if (scheduling.notAfter) {
      parts.push(
        `Not after: ${new Date(scheduling.notAfter).toLocaleString()}`,
      );
    }

    if (scheduling.daysOfWeek && scheduling.daysOfWeek.length > 0) {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const days = scheduling.daysOfWeek.map((d) => dayNames[d]).join(", ");
      parts.push(`Days: ${days}`);
    }

    if (
      scheduling.preferredTimeWindows &&
      scheduling.preferredTimeWindows.length > 0
    ) {
      const windows = scheduling.preferredTimeWindows
        .map((w) => `${w.startTime}-${w.endTime}`)
        .join(", ");
      parts.push(`Time windows: ${windows}`);
    }

    if (scheduling.recurring) {
      const { frequency, interval } = scheduling.recurring;
      parts.push(`Recurring: Every ${interval} ${frequency}`);
      if (scheduling.recurring.until) {
        parts.push(
          `Until: ${new Date(scheduling.recurring.until).toLocaleString()}`,
        );
      }
    }

    return parts.length > 0 ? parts.join(" | ") : "No schedule constraints";
  }

  /**
   * Validate time window doesn't cross midnight incorrectly
   */
  static validateTimeWindow(startTime: string, endTime: string): boolean {
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);

    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    // Allow crossing midnight, just ensure times are valid
    return (
      startHour >= 0 &&
      startHour <= 23 &&
      endHour >= 0 &&
      endHour <= 23 &&
      startMinute >= 0 &&
      startMinute <= 59 &&
      endMinute >= 0 &&
      endMinute <= 59
    );
  }
}

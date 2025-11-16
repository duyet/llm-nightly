/**
 * ScheduleHelper Test Suite
 *
 * Comprehensive tests for schedule helper utilities
 */
import { describe, test, expect } from "bun:test";
import { ScheduleHelper } from "@/utils/ScheduleHelper";
import type { ExtendedTaskConfig } from "@/types";

describe("ScheduleHelper", () => {
  describe("checkSchedule", () => {
    test("returns canExecute true when no scheduling constraints", () => {
      const result = ScheduleHelper.checkSchedule(undefined);

      expect(result.canExecute).toBe(true);
    });

    test("respects notBefore constraint", () => {
      const future = new Date();
      future.setHours(future.getHours() + 1);

      const scheduling: ExtendedTaskConfig["scheduling"] = {
        notBefore: future.toISOString(),
      };

      const result = ScheduleHelper.checkSchedule(scheduling);

      expect(result.canExecute).toBe(false);
      expect(result.reason).toContain("Not before");
      expect(result.nextAvailableTime).toBeDefined();
    });

    test("allows execution after notBefore", () => {
      const past = new Date();
      past.setHours(past.getHours() - 1);

      const scheduling: ExtendedTaskConfig["scheduling"] = {
        notBefore: past.toISOString(),
      };

      const result = ScheduleHelper.checkSchedule(scheduling);

      expect(result.canExecute).toBe(true);
    });

    test("respects notAfter constraint", () => {
      const past = new Date();
      past.setHours(past.getHours() - 1);

      const scheduling: ExtendedTaskConfig["scheduling"] = {
        notAfter: past.toISOString(),
      };

      const result = ScheduleHelper.checkSchedule(scheduling);

      expect(result.canExecute).toBe(false);
      expect(result.reason).toContain("Not after");
    });

    test("allows execution before notAfter", () => {
      const future = new Date();
      future.setHours(future.getHours() + 1);

      const scheduling: ExtendedTaskConfig["scheduling"] = {
        notAfter: future.toISOString(),
      };

      const result = ScheduleHelper.checkSchedule(scheduling);

      expect(result.canExecute).toBe(true);
    });

    test("respects daysOfWeek constraint", () => {
      const now = new Date();
      const currentDay = now.getDay();
      const otherDay = (currentDay + 1) % 7;

      const scheduling: ExtendedTaskConfig["scheduling"] = {
        daysOfWeek: [otherDay],
      };

      const result = ScheduleHelper.checkSchedule(scheduling, now);

      expect(result.canExecute).toBe(false);
      expect(result.reason).toContain("Not scheduled for this day");
      expect(result.nextAvailableTime).toBeDefined();
    });

    test("allows execution on allowed day of week", () => {
      const now = new Date();
      const currentDay = now.getDay();

      const scheduling: ExtendedTaskConfig["scheduling"] = {
        daysOfWeek: [currentDay],
      };

      const result = ScheduleHelper.checkSchedule(scheduling, now);

      expect(result.canExecute).toBe(true);
    });

    test("respects time windows", () => {
      const now = new Date();
      now.setHours(14, 0, 0, 0); // 2:00 PM

      const scheduling: ExtendedTaskConfig["scheduling"] = {
        preferredTimeWindows: [
          { startTime: "09:00", endTime: "12:00" },
          { startTime: "16:00", endTime: "18:00" },
        ],
      };

      const result = ScheduleHelper.checkSchedule(scheduling, now);

      expect(result.canExecute).toBe(false);
      expect(result.nextAvailableTime).toBeDefined();
    });

    test("allows execution within time window", () => {
      const now = new Date();
      now.setHours(10, 0, 0, 0); // 10:00 AM

      const scheduling: ExtendedTaskConfig["scheduling"] = {
        preferredTimeWindows: [{ startTime: "09:00", endTime: "12:00" }],
      };

      const result = ScheduleHelper.checkSchedule(scheduling, now);

      expect(result.canExecute).toBe(true);
    });

    test("handles time windows crossing midnight", () => {
      const now = new Date();
      now.setHours(23, 30, 0, 0); // 11:30 PM

      const scheduling: ExtendedTaskConfig["scheduling"] = {
        preferredTimeWindows: [{ startTime: "22:00", endTime: "02:00" }],
      };

      const result = ScheduleHelper.checkSchedule(scheduling, now);

      expect(result.canExecute).toBe(true);
    });

    test("handles early morning in midnight-crossing window", () => {
      const now = new Date();
      now.setHours(1, 0, 0, 0); // 1:00 AM

      const scheduling: ExtendedTaskConfig["scheduling"] = {
        preferredTimeWindows: [{ startTime: "22:00", endTime: "02:00" }],
      };

      const result = ScheduleHelper.checkSchedule(scheduling, now);

      expect(result.canExecute).toBe(true);
    });

    test("combines multiple constraints", () => {
      const now = new Date();
      const currentDay = now.getDay();
      const future = new Date(now);
      future.setHours(future.getHours() + 1);

      const scheduling: ExtendedTaskConfig["scheduling"] = {
        notBefore: future.toISOString(),
        daysOfWeek: [currentDay],
      };

      const result = ScheduleHelper.checkSchedule(scheduling, now);

      expect(result.canExecute).toBe(false);
    });
  });

  describe("getNextRecurringTime", () => {
    test("calculates next daily recurrence", () => {
      const last = new Date("2024-01-01T10:00:00Z");
      const recurring: NonNullable<
        ExtendedTaskConfig["scheduling"]
      >["recurring"] = {
        frequency: "daily",
        interval: 1,
      };

      const next = ScheduleHelper.getNextRecurringTime(last, recurring);

      expect(next).not.toBeNull();
      expect(next!.getDate()).toBe(2);
    });

    test("calculates weekly recurrence", () => {
      const last = new Date("2024-01-01T10:00:00Z");
      const recurring: NonNullable<
        ExtendedTaskConfig["scheduling"]
      >["recurring"] = {
        frequency: "weekly",
        interval: 1,
      };

      const next = ScheduleHelper.getNextRecurringTime(last, recurring);

      expect(next).not.toBeNull();
      expect(next!.getDate()).toBe(8);
    });

    test("calculates monthly recurrence", () => {
      const last = new Date("2024-01-15T10:00:00Z");
      const recurring: NonNullable<
        ExtendedTaskConfig["scheduling"]
      >["recurring"] = {
        frequency: "monthly",
        interval: 1,
      };

      const next = ScheduleHelper.getNextRecurringTime(last, recurring);

      expect(next).not.toBeNull();
      expect(next!.getMonth()).toBe(1); // February
    });

    test("respects interval multiplier", () => {
      const last = new Date("2024-01-01T10:00:00Z");
      const recurring: NonNullable<
        ExtendedTaskConfig["scheduling"]
      >["recurring"] = {
        frequency: "daily",
        interval: 3,
      };

      const next = ScheduleHelper.getNextRecurringTime(last, recurring);

      expect(next).not.toBeNull();
      expect(next!.getDate()).toBe(4);
    });

    test("returns null when past until date", () => {
      const last = new Date("2024-12-25T10:00:00Z");
      const recurring: NonNullable<
        ExtendedTaskConfig["scheduling"]
      >["recurring"] = {
        frequency: "daily",
        interval: 1,
        until: "2024-12-20T00:00:00Z",
      };

      const next = ScheduleHelper.getNextRecurringTime(last, recurring);

      expect(next).toBeNull();
    });

    test("returns null for undefined recurring", () => {
      const last = new Date();
      const next = ScheduleHelper.getNextRecurringTime(last, undefined);

      expect(next).toBeNull();
    });
  });

  describe("shouldExecuteRecurring", () => {
    test("returns true for first execution", () => {
      const should = ScheduleHelper.shouldExecuteRecurring(null, undefined);

      expect(should).toBe(true);
    });

    test("returns true when enough time has passed", () => {
      const last = new Date();
      last.setDate(last.getDate() - 2);

      const scheduling: ExtendedTaskConfig["scheduling"] = {
        recurring: {
          frequency: "daily",
          interval: 1,
        },
      };

      const should = ScheduleHelper.shouldExecuteRecurring(last, scheduling);

      expect(should).toBe(true);
    });

    test("returns false when not enough time has passed", () => {
      const last = new Date();
      last.setHours(last.getHours() - 1);

      const scheduling: ExtendedTaskConfig["scheduling"] = {
        recurring: {
          frequency: "daily",
          interval: 1,
        },
      };

      const should = ScheduleHelper.shouldExecuteRecurring(last, scheduling);

      expect(should).toBe(false);
    });

    test("returns false when schedule has ended", () => {
      const last = new Date("2024-12-01T10:00:00Z");

      const scheduling: ExtendedTaskConfig["scheduling"] = {
        recurring: {
          frequency: "daily",
          interval: 1,
          until: "2024-11-30T00:00:00Z",
        },
      };

      const should = ScheduleHelper.shouldExecuteRecurring(last, scheduling);

      expect(should).toBe(false);
    });
  });

  describe("formatSchedule", () => {
    test("formats empty schedule", () => {
      const formatted = ScheduleHelper.formatSchedule(undefined);

      expect(formatted).toBe("No schedule constraints");
    });

    test("formats notBefore", () => {
      const scheduling: ExtendedTaskConfig["scheduling"] = {
        notBefore: "2024-01-01T00:00:00Z",
      };

      const formatted = ScheduleHelper.formatSchedule(scheduling);

      expect(formatted).toContain("Not before");
    });

    test("formats notAfter", () => {
      const scheduling: ExtendedTaskConfig["scheduling"] = {
        notAfter: "2024-12-31T23:59:59Z",
      };

      const formatted = ScheduleHelper.formatSchedule(scheduling);

      expect(formatted).toContain("Not after");
    });

    test("formats days of week", () => {
      const scheduling: ExtendedTaskConfig["scheduling"] = {
        daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
      };

      const formatted = ScheduleHelper.formatSchedule(scheduling);

      expect(formatted).toContain("Days:");
      expect(formatted).toContain("Mon");
      expect(formatted).toContain("Wed");
      expect(formatted).toContain("Fri");
    });

    test("formats time windows", () => {
      const scheduling: ExtendedTaskConfig["scheduling"] = {
        preferredTimeWindows: [
          { startTime: "09:00", endTime: "17:00" },
          { startTime: "20:00", endTime: "22:00" },
        ],
      };

      const formatted = ScheduleHelper.formatSchedule(scheduling);

      expect(formatted).toContain("Time windows");
      expect(formatted).toContain("09:00-17:00");
      expect(formatted).toContain("20:00-22:00");
    });

    test("formats recurring schedule", () => {
      const scheduling: ExtendedTaskConfig["scheduling"] = {
        recurring: {
          frequency: "weekly",
          interval: 2,
        },
      };

      const formatted = ScheduleHelper.formatSchedule(scheduling);

      expect(formatted).toContain("Recurring");
      expect(formatted).toContain("Every 2 weekly");
    });

    test("formats recurring with until", () => {
      const scheduling: ExtendedTaskConfig["scheduling"] = {
        recurring: {
          frequency: "daily",
          interval: 1,
          until: "2024-12-31T00:00:00Z",
        },
      };

      const formatted = ScheduleHelper.formatSchedule(scheduling);

      expect(formatted).toContain("Until:");
    });

    test("formats multiple constraints", () => {
      const scheduling: ExtendedTaskConfig["scheduling"] = {
        notBefore: "2024-01-01T00:00:00Z",
        daysOfWeek: [1, 2, 3],
        preferredTimeWindows: [{ startTime: "09:00", endTime: "17:00" }],
      };

      const formatted = ScheduleHelper.formatSchedule(scheduling);

      expect(formatted).toContain("Not before");
      expect(formatted).toContain("Days:");
      expect(formatted).toContain("Time windows");
    });
  });

  describe("validateTimeWindow", () => {
    test("validates correct time window", () => {
      const valid = ScheduleHelper.validateTimeWindow("09:00", "17:00");

      expect(valid).toBe(true);
    });

    test("allows midnight crossing", () => {
      const valid = ScheduleHelper.validateTimeWindow("22:00", "02:00");

      expect(valid).toBe(true);
    });

    test("validates hours in range", () => {
      const valid = ScheduleHelper.validateTimeWindow("00:00", "23:59");

      expect(valid).toBe(true);
    });

    test("rejects invalid start hour", () => {
      const valid = ScheduleHelper.validateTimeWindow("25:00", "17:00");

      expect(valid).toBe(false);
    });

    test("rejects invalid end hour", () => {
      const valid = ScheduleHelper.validateTimeWindow("09:00", "24:00");

      expect(valid).toBe(false);
    });

    test("rejects invalid start minute", () => {
      const valid = ScheduleHelper.validateTimeWindow("09:60", "17:00");

      expect(valid).toBe(false);
    });

    test("rejects invalid end minute", () => {
      const valid = ScheduleHelper.validateTimeWindow("09:00", "17:61");

      expect(valid).toBe(false);
    });

    test("rejects negative hours", () => {
      const valid = ScheduleHelper.validateTimeWindow("-1:00", "17:00");

      expect(valid).toBe(false);
    });

    test("rejects negative minutes", () => {
      const valid = ScheduleHelper.validateTimeWindow("09:-1", "17:00");

      expect(valid).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("handles exact boundary times", () => {
      const now = new Date();
      now.setHours(12, 0, 0, 0);

      const scheduling: ExtendedTaskConfig["scheduling"] = {
        preferredTimeWindows: [{ startTime: "12:00", endTime: "13:00" }],
      };

      const result = ScheduleHelper.checkSchedule(scheduling, now);

      expect(result.canExecute).toBe(true);
    });

    test("handles end of day boundary", () => {
      const now = new Date();
      now.setHours(23, 59, 0, 0);

      const scheduling: ExtendedTaskConfig["scheduling"] = {
        preferredTimeWindows: [{ startTime: "23:00", endTime: "23:59" }],
      };

      const result = ScheduleHelper.checkSchedule(scheduling, now);

      expect(result.canExecute).toBe(true);
    });

    test("handles midnight exactly", () => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const scheduling: ExtendedTaskConfig["scheduling"] = {
        preferredTimeWindows: [{ startTime: "00:00", endTime: "01:00" }],
      };

      const result = ScheduleHelper.checkSchedule(scheduling, now);

      expect(result.canExecute).toBe(true);
    });

    test("handles empty daysOfWeek array", () => {
      const scheduling: ExtendedTaskConfig["scheduling"] = {
        daysOfWeek: [],
      };

      const result = ScheduleHelper.checkSchedule(scheduling);

      expect(result.canExecute).toBe(true);
    });

    test("handles month boundary in monthly recurrence", () => {
      const last = new Date("2024-01-31T10:00:00Z");
      const recurring: NonNullable<
        ExtendedTaskConfig["scheduling"]
      >["recurring"] = {
        frequency: "monthly",
        interval: 1,
      };

      const next = ScheduleHelper.getNextRecurringTime(last, recurring);

      expect(next).not.toBeNull();
      // Feb has fewer days, should handle gracefully
    });

    test("handles leap year in recurring schedules", () => {
      const last = new Date("2024-02-29T10:00:00Z");
      const recurring: NonNullable<
        ExtendedTaskConfig["scheduling"]
      >["recurring"] = {
        frequency: "daily",
        interval: 1,
      };

      const next = ScheduleHelper.getNextRecurringTime(last, recurring);

      expect(next).not.toBeNull();
      expect(next!.getMonth()).toBe(2); // March
    });
  });
});

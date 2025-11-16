/**
 * FileStorage - High-performance file I/O using Bun APIs with security controls
 */
import { dirname } from "node:path";
import { mkdir, appendFile, unlink, rename } from "node:fs/promises";
import {
  PathValidator,
  ResourceValidator,
  InputValidator,
  SECURITY_LIMITS,
} from "@/utils/SecurityUtils";

export interface FileStorageConfig {
  baseDir: string;
  maxFileSize?: number;
}

export class FileStorage {
  private baseDir: string;
  private maxFileSize: number;

  constructor(config?: FileStorageConfig) {
    this.baseDir = config?.baseDir || process.cwd();
    this.maxFileSize = config?.maxFileSize || SECURITY_LIMITS.MAX_FILE_SIZE;
  }

  /**
   * Validate and sanitize path
   */
  private validatePath(path: string): string {
    return PathValidator.sanitize(path, this.baseDir);
  }

  async writeMarkdown(path: string, content: string): Promise<void> {
    const safePath = this.validatePath(path);
    InputValidator.validateStringSize(content);
    ResourceValidator.validateContentSize(content);

    // Ensure directory exists
    const dir = dirname(safePath);
    await mkdir(dir, { recursive: true });

    await Bun.write(safePath, content);
  }

  async readMarkdown(path: string): Promise<string | null> {
    const safePath = this.validatePath(path);
    await ResourceValidator.validateFileSize(safePath, this.maxFileSize);

    const file = Bun.file(safePath);
    if (await file.exists()) {
      const content = await file.text();
      InputValidator.validateStringSize(content);
      return content;
    }
    return null;
  }

  async writeJSON<T>(path: string, data: T): Promise<void> {
    const safePath = this.validatePath(path);
    const jsonString = JSON.stringify(data, null, 2);

    InputValidator.validateStringSize(jsonString);
    ResourceValidator.validateContentSize(jsonString, SECURITY_LIMITS.MAX_JSON_SIZE);

    // Ensure directory exists
    const dir = dirname(safePath);
    await mkdir(dir, { recursive: true });

    await Bun.write(safePath, jsonString);
  }

  async readJSON<T>(path: string): Promise<T | null> {
    const safePath = this.validatePath(path);
    await ResourceValidator.validateFileSize(safePath, SECURITY_LIMITS.MAX_JSON_SIZE);

    const file = Bun.file(safePath);
    if (await file.exists()) {
      // Validate file size before reading
      if (file.size > SECURITY_LIMITS.MAX_JSON_SIZE) {
        throw new Error(
          `JSON file too large: ${file.size} bytes exceeds limit of ${SECURITY_LIMITS.MAX_JSON_SIZE}`,
        );
      }

      const content = await file.text();
      return await InputValidator.safeJsonParse<T>(content);
    }
    return null;
  }

  async exists(path: string): Promise<boolean> {
    const safePath = this.validatePath(path);
    const file = Bun.file(safePath);
    return await file.exists();
  }

  async read(path: string): Promise<string> {
    const safePath = this.validatePath(path);
    await ResourceValidator.validateFileSize(safePath, this.maxFileSize);

    const file = Bun.file(safePath);
    const content = await file.text();
    InputValidator.validateStringSize(content);

    return content;
  }

  async write(path: string, content: string): Promise<void> {
    const safePath = this.validatePath(path);
    InputValidator.validateStringSize(content);
    ResourceValidator.validateContentSize(content);

    // Ensure directory exists
    const dir = dirname(safePath);
    await mkdir(dir, { recursive: true });

    await Bun.write(safePath, content);
  }

  async append(filePath: string, content: string): Promise<void> {
    const safePath = this.validatePath(filePath);
    InputValidator.validateStringSize(content);
    ResourceValidator.validateContentSize(content);

    // Ensure directory exists
    const dir = dirname(safePath);
    await mkdir(dir, { recursive: true });

    // Use Node.js appendFile which is atomic and handles concurrency
    await appendFile(safePath, content, "utf-8");
  }

  async delete(path: string): Promise<void> {
    const safePath = this.validatePath(path);

    try {
      await unlink(safePath);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  async move(from: string, to: string): Promise<void> {
    const safeFrom = this.validatePath(from);
    const safeTo = this.validatePath(to);

    // Ensure destination directory exists
    const dir = dirname(safeTo);
    await mkdir(dir, { recursive: true });

    await rename(safeFrom, safeTo);
  }
}

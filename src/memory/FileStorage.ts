/**
 * FileStorage - High-performance file I/O using Bun APIs
 */

export class FileStorage {
  async writeMarkdown(path: string, content: string): Promise<void> {
    await Bun.write(path, content);
  }

  async readMarkdown(path: string): Promise<string | null> {
    const file = Bun.file(path);
    if (await file.exists()) {
      return await file.text();
    }
    return null;
  }

  async writeJSON<T>(path: string, data: T): Promise<void> {
    await Bun.write(path, JSON.stringify(data, null, 2));
  }

  async readJSON<T>(path: string): Promise<T | null> {
    const file = Bun.file(path);
    if (await file.exists()) {
      return await file.json();
    }
    return null;
  }

  async exists(path: string): Promise<boolean> {
    const file = Bun.file(path);
    return await file.exists();
  }
}

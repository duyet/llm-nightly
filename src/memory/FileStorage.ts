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

  async read(path: string): Promise<string> {
    const file = Bun.file(path);
    return await file.text();
  }

  async write(path: string, content: string): Promise<void> {
    await Bun.write(path, content);
  }

  async append(path: string, content: string): Promise<void> {
    // Ensure directory exists
    const dir = path.substring(0, path.lastIndexOf("/"));
    await Bun.write(`${dir}/.placeholder`, "");

    const file = Bun.file(path);
    const existing = (await file.exists()) ? await file.text() : "";
    await Bun.write(path, existing + content);
  }

  async delete(path: string): Promise<void> {
    try {
      await Bun.write(path, "");
      // Bun doesn't have file.delete(), use Node's fs
      const fs = await import("node:fs/promises");
      await fs.unlink(path);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  async move(from: string, to: string): Promise<void> {
    const fs = await import("node:fs/promises");
    await fs.rename(from, to);
  }
}

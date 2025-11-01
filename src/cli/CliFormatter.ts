/**
 * CLI Formatter - Rich terminal output with colors and formatting
 */
import chalk from "chalk";
import type { Task, TaskStatus } from "@/types";
import type { HealthCheckResult } from "@/monitoring/HealthCheck";

export class CliFormatter {
  /**
   * Format a success message
   */
  static success(message: string): string {
    return `${chalk.green("✓")} ${chalk.green(message)}`;
  }

  /**
   * Format an error message
   */
  static error(message: string, detail?: string): string {
    const main = `${chalk.red("✗")} ${chalk.red.bold(message)}`;
    return detail ? `${main}\n  ${chalk.gray(detail)}` : main;
  }

  /**
   * Format a warning message
   */
  static warning(message: string): string {
    return `${chalk.yellow("⚠")} ${chalk.yellow(message)}`;
  }

  /**
   * Format an info message
   */
  static info(message: string): string {
    return `${chalk.blue("ℹ")} ${message}`;
  }

  /**
   * Format a section header
   */
  static header(title: string): string {
    const line = "═".repeat(Math.min(title.length + 4, 80));
    return `\n${chalk.bold.cyan(line)}\n${chalk.bold.cyan(`  ${title}`)}\n${chalk.bold.cyan(line)}\n`;
  }

  /**
   * Format a sub-section
   */
  static section(title: string): string {
    return `\n${chalk.bold.white(title)}`;
  }

  /**
   * Format task status
   */
  static taskStatus(status: TaskStatus): string {
    const statusMap: Record<TaskStatus, { icon: string; color: typeof chalk }> =
      {
        open: { icon: "○", color: chalk.blue },
        "in-progress": { icon: "◐", color: chalk.yellow },
        done: { icon: "●", color: chalk.green },
        blocked: { icon: "⊗", color: chalk.red },
      };

    const { icon, color } = statusMap[status] || {
      icon: "?",
      color: chalk.gray,
    };
    return color(`${icon} ${status}`);
  }

  /**
   * Format task priority
   */
  static taskPriority(priority: number): string {
    const priorityMap: Record<number, { label: string; color: typeof chalk }> =
      {
        1: { label: "CRITICAL", color: chalk.red.bold },
        2: { label: "HIGH", color: chalk.red },
        3: { label: "NORMAL", color: chalk.yellow },
        4: { label: "LOW", color: chalk.blue },
        5: { label: "MINIMAL", color: chalk.gray },
      };

    const { label, color } = priorityMap[priority] || {
      label: "UNKNOWN",
      color: chalk.gray,
    };
    return color(label);
  }

  /**
   * Format a task card
   */
  static taskCard(task: Task): string {
    const lines = [
      chalk.bold(task.config.title),
      `  ${chalk.gray("ID:")} ${chalk.cyan(task.config.id)}`,
      `  ${chalk.gray("Status:")} ${this.taskStatus(task.status)}`,
      `  ${chalk.gray("Priority:")} ${this.taskPriority(task.config.priority)}`,
      `  ${chalk.gray("Created:")} ${new Date(task.config.createdAt).toLocaleString()}`,
    ];

    if (task.config.tags.length > 0) {
      lines.push(
        `  ${chalk.gray("Tags:")} ${task.config.tags.map((t) => chalk.magenta(`#${t}`)).join(" ")}`,
      );
    }

    if (task.config.dependencies.length > 0) {
      lines.push(
        `  ${chalk.gray("Dependencies:")} ${task.config.dependencies.length}`,
      );
    }

    return lines.join("\n");
  }

  /**
   * Format a task list
   */
  static taskList(tasks: Task[]): string {
    if (tasks.length === 0) {
      return chalk.gray("  No tasks found");
    }

    return tasks
      .map((task, i) => {
        const separator = i < tasks.length - 1 ? "\n" : "";
        return `${this.taskCard(task)}${separator}`;
      })
      .join("\n");
  }

  /**
   * Format health check results
   */
  static healthCheck(result: HealthCheckResult): string {
    const overallMap = {
      healthy: { icon: "✓", color: chalk.green },
      degraded: { icon: "⚠", color: chalk.yellow },
      down: { icon: "✗", color: chalk.red },
      critical: { icon: "⚠", color: chalk.red.bold },
    };

    const { icon, color } = overallMap[result.overall];
    const lines = [
      color.bold(`${icon} System Health: ${result.overall.toUpperCase()}`),
      "",
      chalk.bold("Status Checks:"),
    ];

    for (const check of result.checks) {
      const checkIcon =
        check.status === "pass" ? chalk.green("✓") : chalk.red("✗");
      lines.push(`  ${checkIcon} ${check.name}: ${check.message}`);
    }

    if (result.recommendations.length > 0) {
      lines.push("", chalk.bold("Recommendations:"));
      for (const rec of result.recommendations) {
        lines.push(`  ${chalk.yellow("→")} ${rec}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Format a table
   */
  static table(
    headers: string[],
    rows: string[][],
    options: { maxWidth?: number } = {},
  ): string {
    const maxWidth = options.maxWidth || 120;

    // Calculate column widths
    const colWidths = headers.map((h, i) => {
      const maxContentWidth = Math.max(
        h.length,
        ...rows.map((r) => (r[i] || "").length),
      );
      return Math.min(maxContentWidth, Math.floor(maxWidth / headers.length));
    });

    // Format header
    const headerRow = headers
      .map((h, i) => chalk.bold(h.padEnd(colWidths[i])))
      .join(" │ ");
    const separator = colWidths.map((w) => "─".repeat(w)).join("─┼─");

    // Format rows
    const dataRows = rows.map((row) =>
      row
        .map((cell, i) => {
          const truncated =
            cell.length > colWidths[i]
              ? cell.slice(0, colWidths[i] - 3) + "..."
              : cell;
          return truncated.padEnd(colWidths[i]);
        })
        .join(" │ "),
    );

    return [headerRow, separator, ...dataRows].join("\n");
  }

  /**
   * Format a progress bar
   */
  static progressBar(
    current: number,
    total: number,
    options: { width?: number; label?: string } = {},
  ): string {
    const width = options.width || 40;
    const percentage = Math.min(Math.max((current / total) * 100, 0), 100);
    const filled = Math.round((width * percentage) / 100);
    const empty = width - filled;

    const bar = chalk.green("█".repeat(filled)) + chalk.gray("░".repeat(empty));
    const label = options.label || `${current}/${total}`;

    return `${bar} ${chalk.cyan(percentage.toFixed(1))}% ${chalk.gray(label)}`;
  }

  /**
   * Format a spinner with message
   */
  static spinner(message: string, frame: number = 0): string {
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    const spinner = chalk.cyan(frames[frame % frames.length]);
    return `${spinner} ${message}`;
  }

  /**
   * Format a key-value pair
   */
  static keyValue(
    key: string,
    value: string,
    options: { color?: boolean } = {},
  ): string {
    const formattedKey = chalk.gray(`${key}:`);
    const formattedValue = options.color ? value : chalk.white(value);
    return `${formattedKey} ${formattedValue}`;
  }

  /**
   * Format a list
   */
  static list(
    items: string[],
    options: { bullet?: string; indent?: number } = {},
  ): string {
    const bullet = options.bullet || "•";
    const indent = " ".repeat(options.indent || 2);
    return items
      .map((item) => `${indent}${chalk.cyan(bullet)} ${item}`)
      .join("\n");
  }

  /**
   * Format a divider
   */
  static divider(char: string = "─", length: number = 80): string {
    return chalk.gray(char.repeat(length));
  }

  /**
   * Format JSON with syntax highlighting
   */
  static json(obj: unknown): string {
    const json = JSON.stringify(obj, null, 2);
    return json
      .replace(/"([^"]+)":/g, (_, key) => `${chalk.cyan(`"${key}"`)}: `)
      .replace(/: "([^"]+)"/g, (_, val) => `: ${chalk.green(`"${val}"`)}`)
      .replace(/: (\d+)/g, (_, num) => `: ${chalk.yellow(num)}`)
      .replace(/: (true|false)/g, (_, bool) => `: ${chalk.magenta(bool)}`)
      .replace(/: null/g, `: ${chalk.gray("null")}`);
  }

  /**
   * Format a banner
   */
  static banner(text: string): string {
    const lines = text.split("\n");
    const maxLength = Math.max(...lines.map((l) => l.length));
    const border = "═".repeat(maxLength + 4);

    const formatted = [
      chalk.bold.cyan(`╔${border}╗`),
      ...lines.map((line) =>
        chalk.bold.cyan(`║  ${line.padEnd(maxLength)}  ║`),
      ),
      chalk.bold.cyan(`╚${border}╝`),
    ];

    return formatted.join("\n");
  }

  /**
   * Clear the current line (for spinners/progress)
   */
  static clearLine(): string {
    return "\r\x1b[K";
  }

  /**
   * Move cursor up n lines
   */
  static cursorUp(n: number = 1): string {
    return `\x1b[${n}A`;
  }
}

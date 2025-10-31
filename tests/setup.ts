/**
 * Test setup and global configuration
 */
import { beforeAll, afterAll } from "bun:test";

beforeAll(() => {
  // Global test setup
  process.env.NODE_ENV = "test";
});

afterAll(() => {
  // Global test cleanup
});

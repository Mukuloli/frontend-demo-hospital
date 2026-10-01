import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: "http://localhost:3000", browserName: "chromium", channel: "chrome", headless: true },
  reporter: "list",
});

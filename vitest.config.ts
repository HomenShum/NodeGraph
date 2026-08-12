import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // render/ is the view layer with its own runner (node:test via
    // `cd render && npm test`); vitest must not collect its .test.mjs files.
    exclude: ["node_modules/**", "dist/**", "render/**"],
  },
});

// Kept separate from vite.config.ts: that one sets root to web/ for building
// the browser UI, while the tests live in test/ at the repository root.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});

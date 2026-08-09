import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Each e2e run gets a throwaway config dir + canvas folder so tests never
// touch the developer's real ~/.agent-flow-canvas or canvases.
const configDir = mkdtempSync(join(tmpdir(), "afc-e2e-config-"));
const canvasFolder = mkdtempSync(join(tmpdir(), "afc-e2e-canvases-"));

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4123",
    viewport: { width: 1400, height: 900 },
  },
  webServer: {
    command: "npm run build && tsx server/index.ts",
    url: "http://127.0.0.1:4123/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: "4123",
      AFC_CONFIG_DIR: configDir,
      AFC_E2E_CANVAS_FOLDER: canvasFolder,
    },
  },
});

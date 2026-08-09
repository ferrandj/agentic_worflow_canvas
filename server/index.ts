import { homedir } from "node:os";
import { join } from "node:path";
import { buildApp } from "./app.js";
import { ConfigStore } from "./config.js";

const PORT = Number(process.env.PORT ?? 4001);
const CONFIG_DIR = process.env.AFC_CONFIG_DIR ?? join(homedir(), ".agent-flow-canvas");

// e2e runs pre-seed a throwaway canvas folder via env so tests are hermetic.
if (process.env.AFC_E2E_CANVAS_FOLDER) {
  new ConfigStore(CONFIG_DIR).write({ folder: process.env.AFC_E2E_CANVAS_FOLDER });
}

const app = buildApp({ configDir: CONFIG_DIR });

app.listen(PORT, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`Agent Flow Canvas server listening on http://127.0.0.1:${PORT}`);
});

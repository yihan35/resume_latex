import path from "node:path";

import { createApp } from "./app.js";
import { createAppConfig } from "./config/appConfig.js";

function getErrorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error
    ? error.code
    : undefined;
}

try {
  process.loadEnvFile(path.resolve(".env.local"));
} catch (error) {
  if (getErrorCode(error) !== "ENOENT") throw error;
}

const config = createAppConfig();
const app = createApp({ config, staticDir: path.resolve("dist") });
const server = app.listen(config.serverPort, "127.0.0.1", () => {
  console.log(`Resume editor: http://127.0.0.1:${config.serverPort}`);
  console.log(`Project root: ${config.projectRoot}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => server.close(() => process.exit(0)));
}

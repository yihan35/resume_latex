import { createApp } from "./app.js";
import { createAppConfig } from "./config/appConfig.js";

const config = createAppConfig();
const app = createApp({
  projectRoot: config.projectRoot,
  entryFiles: config.entryFiles,
});

app.listen(config.serverPort, "127.0.0.1", () => {
  console.log(`Resume editor API: http://127.0.0.1:${config.serverPort}`);
  console.log(`Project root: ${config.projectRoot}`);
});

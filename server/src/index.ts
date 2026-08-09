import { PROJECT_ROOT, SERVER_PORT } from "./config.js";
import { createApp } from "./app.js";

const app = createApp({ projectRoot: PROJECT_ROOT });

app.listen(SERVER_PORT, "127.0.0.1", () => {
  console.log(`Resume editor API: http://127.0.0.1:${SERVER_PORT}`);
  console.log(`Project root: ${PROJECT_ROOT}`);
});

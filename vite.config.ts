import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const clientPort = Number.parseInt(
  process.env.RESUME_EDITOR_CLIENT_PORT ?? "5173",
  10,
);
const serverPort = Number.parseInt(
  process.env.RESUME_EDITOR_PORT ?? "43871",
  10,
);

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: clientPort,
    proxy: {
      "/api": `http://127.0.0.1:${serverPort}`,
    },
  },
});

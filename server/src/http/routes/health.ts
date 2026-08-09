import { Router } from "express";

import type { ToolAvailabilityChecker } from "../../process/checkToolAvailability.js";

export function createHealthRouter(options: {
  latexCommand: string;
  synctexCommand: string;
  checkToolAvailability: ToolAvailabilityChecker;
}): Router {
  const router = Router();
  let cachedTools: Promise<{ latex: boolean; synctex: boolean }> | undefined;

  const check = async (command: string): Promise<boolean> => {
    try {
      return await options.checkToolAvailability(command);
    } catch {
      return false;
    }
  };

  const tools = () => {
    cachedTools ??= Promise.all([
      check(options.latexCommand),
      check(options.synctexCommand),
    ]).then(([latex, synctex]) => ({ latex, synctex }));
    return cachedTools;
  };

  router.get("/api/health", async (_request, response) => {
    response.json({
      ok: true,
      tools: await tools(),
    });
  });

  return router;
}

import { Router } from "express";

export function createHealthRouter(options: {
  latexCommand: string;
  synctexCommand: string;
}): Router {
  const router = Router();

  router.get("/api/health", (_request, response) => {
    response.json({
      ok: true,
      tools: {
        latex: options.latexCommand.trim().length > 0,
        synctex: options.synctexCommand.trim().length > 0,
      },
    });
  });

  return router;
}

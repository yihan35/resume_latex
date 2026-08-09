import { Router } from "express";

import { discoverResumes, discoverTexFiles } from "../../domain/discovery.js";

export function createProjectRouter(options: {
  projectRoot: string;
  entryFiles: readonly string[];
}): Router {
  const router = Router();

  router.get("/api/project", async (_request, response) => {
    const [resumes, texFiles] = await Promise.all([
      discoverResumes(options.projectRoot, options.entryFiles),
      discoverTexFiles(options.projectRoot),
    ]);
    response.json({ resumes, texFiles });
  });

  return router;
}

import fs from "node:fs";
import path from "node:path";
import express, { type ErrorRequestHandler, type Express } from "express";
import { apiRouter } from "./api/router.ts";
import { config } from "./config.ts";
import type { DB } from "./db.ts";

/** The JSON API under /api, and the built React app (when present) for everything else. */
export function createApp(db: DB, clientDist = config.clientDist): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", apiRouter(db));

  if (fs.existsSync(clientDist)) {
    // Vite fingerprints asset file names, so they can be cached for a long time; index.html can't.
    app.use("/assets", express.static(path.join(clientDist, "assets"), { immutable: true, maxAge: "1y" }));
    app.use(express.static(clientDist, { index: false }));
    app.get("/{*page}", (_req, res) => res.set("cache-control", "no-cache").sendFile(path.join(clientDist, "index.html")));
  }

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  };
  app.use(onError);
  return app;
}

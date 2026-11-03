import express from "express";
import { createApp } from "../server/app.mjs";

const app = express();
app.use((req, res, next) => {
  const raw = req.originalUrl || req.url || "/";
  if (raw === "/api" || raw.startsWith("/api/")) {
    req.url = raw === "/api" ? "/" : raw.slice(4);
  }
  next();
});
app.use(createApp({ serveStatic: false, apiPrefix: "" }));

export default app;

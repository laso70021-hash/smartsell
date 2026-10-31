import { createApp } from "./app.mjs";
const { app } = createApp({
  dbPath: process.env.DATABASE_PATH || "data/dukapro.db",
});
const port = Number(process.env.PORT || 3001);
app.listen(port, "127.0.0.1", () =>
  console.log(`Smartsell API: http://127.0.0.1:${port}`),
);

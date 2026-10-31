// Isolated browser QA server: no files, seed accounts or records in the real database.
import { createApp } from "../server/app.mjs";
process.env.APP_ORIGIN = "http://127.0.0.1:3002";
const { app } = createApp({ dbPath: ":memory:" });
app.listen(3002, "127.0.0.1", () =>
  console.log("Isolated in-memory browser test: http://127.0.0.1:3002"),
);

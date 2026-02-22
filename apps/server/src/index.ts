import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { translateRoutes } from "./routes/translate";
import { searchRoutes } from "./routes/search";
import { lyricsRoutes } from "./routes/lyrics";
import { configRoutes } from "./routes/config";

const app = new Hono();

// ─── Middleware ──────────────────────────────────────────────
app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173"],
  })
);

// ─── Routes ─────────────────────────────────────────────────
app.route("/api/translate", translateRoutes);
app.route("/api/search", searchRoutes);
app.route("/api/lyrics", lyricsRoutes);
app.route("/api/config", configRoutes);

// ─── Health check ───────────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok" }));

// ─── Start ──────────────────────────────────────────────────
const port = parseInt(Bun.env.PORT || "3001");

console.log(`LyriLearn server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};

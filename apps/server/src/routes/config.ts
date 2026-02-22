import { Hono } from "hono";
import { getProviderStatus } from "../services/translation";

export const configRoutes = new Hono();

/**
 * GET /api/config
 * Returns provider availability status and available models.
 */
configRoutes.get("/", async (c) => {
  try {
    const status = await getProviderStatus();
    return c.json({ data: status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Config check failed";
    return c.json({ error: message }, 500);
  }
});

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Hono } from "hono";

// ─── Mock the ENTIRE translation service (not individual providers) ───
// This avoids conflicting with translation/index.test.ts which mocks ./local and ./cloud

(globalThis as any).__translateRouteMock = {
  result: null as any,
  error: null as Error | null,
};

mock.module("../services/translation", () => ({
  translate: async () => {
    const m = (globalThis as any).__translateRouteMock;
    if (m.error) throw m.error;
    return m.result;
  },
  getProviderStatus: async () => ({ local: false, cloud: false, models: {} }),
}));

import { translateRoutes } from "./translate";

const app = new Hono();
app.route("/api/translate", translateRoutes);

function post(body: any) {
  return app.request("http://localhost/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  (globalThis as any).__translateRouteMock.result = null;
  (globalThis as any).__translateRouteMock.error = null;
});

describe("POST /api/translate", () => {
  test("returns 400 when text is missing", async () => {
    const res = await post({ sourceLang: "ru", targetLang: "en" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required fields");
  });

  test("returns 400 when sourceLang is missing", async () => {
    const res = await post({ text: "hello", targetLang: "en" });
    expect(res.status).toBe(400);
  });

  test("returns 400 when targetLang is missing", async () => {
    const res = await post({ text: "hello", sourceLang: "en" });
    expect(res.status).toBe(400);
  });

  test("returns translation result on success", async () => {
    (globalThis as any).__translateRouteMock.result = {
      translatedText: "Привет",
      provider: "local",
      modelVariant: "translategemma-12b-4bit",
      latencyMs: 150,
    };

    const res = await post({
      text: "Hello",
      sourceLang: "en",
      targetLang: "ru",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.translatedText).toBe("Привет");
    expect(body.data.provider).toBe("local");
  });

  test("returns 503 when no provider available", async () => {
    (globalThis as any).__translateRouteMock.error = new Error(
      "No translation provider available"
    );

    const res = await post({
      text: "Hello",
      sourceLang: "en",
      targetLang: "ru",
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("No translation provider available");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, listAll, request } from "@/lib/api/client";
import { markApplied, setSaved } from "@/lib/api/opportunities";

type Call = { url: string; init: RequestInit };

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let calls: Call[];
let responses: Response[];

beforeEach(() => {
  calls = [];
  responses = [];
  document.cookie = "csrftoken=tok123";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return responses.shift() ?? json(200, {});
    }),
  );
  window.history.replaceState(null, "", "/dashboard");
});

afterEach(() => vi.unstubAllGlobals());

const headers = (c: Call) => c.init.headers as Record<string, string>;

describe("request()", () => {
  it("calls the proxied API with the time zone, and CSRF on writes only", async () => {
    responses.push(json(200, { ok: 1 }), json(200, { ok: 2 }));
    await request("/opportunities", { query: { type: "Job", q: "" } });
    await request("/preferences", { method: "PATCH", body: { language: "en" } });
    expect(calls[0].url).toBe("/api/opportunities?type=Job");
    expect(headers(calls[0])["X-Timezone"]).toBeTruthy();
    expect(headers(calls[0])["X-CSRFToken"]).toBeUndefined();
    expect(calls[1].init.method).toBe("PATCH");
    expect(headers(calls[1])["X-CSRFToken"]).toBe("tok123");
    expect(calls[1].init.body).toBe('{"language":"en"}');
    expect(calls[1].init.credentials).toBe("same-origin");
  });

  it("maps API errors to codes the UI understands", async () => {
    const cases: [Response, string][] = [
      [json(409, { error: { code: "gmail_access", message: "x" } }), "gmail"],
      [json(404, { error: { code: "not_found", message: "Not found." } }), "not_found"],
      [json(400, { error: { code: "validation_error", message: "Bad", fields: { name: ["Required"] } } }), "validation"],
      [json(502, undefined), "server"],
    ];
    for (const [res, code] of cases) {
      responses.push(res);
      await expect(request("/x")).rejects.toMatchObject({ code });
    }
    responses.push(json(400, { error: { code: "validation_error", message: "Bad", fields: { name: ["Required"] } } }));
    const err = (await request("/x").catch((e) => e)) as ApiError;
    expect(err.fields).toEqual({ name: ["Required"] });
  });

  it("signs in the demo user once on 401 (dev) and retries", async () => {
    responses.push(json(401, { error: { code: "not_authenticated", message: "" } }), json(200, { email: "x" }), json(200, { ok: true }));
    await expect(request("/auth/me")).resolves.toEqual({ ok: true });
    expect(calls.map((c) => c.url)).toEqual(["/api/auth/me", "/api/auth/dev-login", "/api/auth/me"]);
  });

  it("reports an expired session when sign-in fails", async () => {
    responses.push(json(401, {}), json(409, {}));
    await expect(request("/auth/me")).rejects.toMatchObject({ code: "auth" });
  });

  it("turns network failures into the network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(request("/x")).rejects.toMatchObject({ code: "network", message: expect.stringMatching(/couldn't reach Oppora/) });
  });

  it("returns undefined for 204", async () => {
    responses.push(new Response(null, { status: 204 }));
    await expect(request("/auth/me/data", { method: "DELETE" })).resolves.toBeUndefined();
  });
});

describe("dev state switches", () => {
  it("?mock=error / gmail / empty never hit the network", async () => {
    window.history.replaceState(null, "", "/dashboard?mock=error");
    await expect(request("/x")).rejects.toMatchObject({ code: "network" });
    window.history.replaceState(null, "", "/dashboard?mock=gmail");
    await expect(request("/x")).rejects.toMatchObject({ code: "gmail" });
    responses.push(json(200, { ok: true }));
    await expect(request("/preferences", { gmail: false })).resolves.toEqual({ ok: true }); // account endpoints still load
    window.history.replaceState(null, "", "/dashboard?mock=empty");
    await expect(request("/x", { empty: () => [] })).resolves.toEqual([]);
    expect(calls.map((c) => c.url)).toEqual(["/api/preferences"]);
  });
});

describe("services", () => {
  it("listAll follows pages", async () => {
    responses.push(json(200, { count: 3, next: "/api/emails/?page=2", results: [1, 2] }), json(200, { count: 3, next: null, results: [3] }));
    await expect(listAll<number>("/emails", { opportunity: "o1" })).resolves.toEqual([1, 2, 3]);
    expect(calls[1].url).toBe("/api/emails?opportunity=o1&page=2&page_size=200");
  });

  it("saving uses /api/saved and returns the fresh opportunity", async () => {
    responses.push(json(201, {}), json(200, { id: "o1", saved: true }), new Response(null, { status: 204 }), json(200, { id: "o1", saved: false }));
    await expect(setSaved("o1", true)).resolves.toMatchObject({ saved: true });
    await expect(setSaved("o1", false)).resolves.toMatchObject({ saved: false });
    expect(calls.map((c) => `${c.init.method ?? "GET"} ${c.url}`)).toEqual([
      "POST /api/saved",
      "GET /api/opportunities/o1",
      "DELETE /api/saved?opportunityId=o1",
      "GET /api/opportunities/o1",
    ]);
  });

  it("mark applied posts an application", async () => {
    responses.push(json(201, { status: "applied", opportunity: { id: "o1", application: { status: "applied" } } }));
    await expect(markApplied("o1")).resolves.toMatchObject({ application: { status: "applied" } });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ opportunityId: "o1", status: "applied" });
  });
});

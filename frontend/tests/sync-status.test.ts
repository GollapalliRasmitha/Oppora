import { describe, expect, it } from "vitest";
import { describeSync, syncCounts } from "@/components/oppora/sync-status";
import type { SyncStatus } from "@/lib/domain/types";

const NOW = new Date("2026-10-06T10:00:00Z");
const base: SyncStatus = {
  phase: "completed",
  emailsInBatch: 0,
  lastSyncedAt: "2026-10-06T09:58:00Z",
  queued: 0,
  waitReason: "",
  fetched: 312,
  filtered: 250,
  analysed: 48,
  failed: 0,
  found: 7,
};

describe("the sync card says what really happened", () => {
  it("shows the totals", () => {
    expect(syncCounts(base)).toBe("Fetched 312 emails · analysed 48 · found 7 opportunities");
    expect(syncCounts({ ...base, fetched: 1, analysed: 1, found: 1 })).toBe("Fetched 1 email · analysed 1 · found 1 opportunity");
  });

  it('"Sync completed" only when nothing is waiting', () => {
    const d = describeSync(base, false, NOW);
    expect(d.title).toBe("Sync completed");
    expect(d.detail).toBe("Fetched 312 emails · analysed 48 · found 7 opportunities");
    expect(d.tone).toBe("ok");
  });

  it("the AI's daily limit: paused, how many wait, and when it continues", () => {
    const d = describeSync({ ...base, found: 0, queued: 140, waitReason: "ai_quota", resetsAt: "2026-10-07T07:00:00Z" }, false, NOW);
    expect(d.title).toBe("Analysis paused: today's AI limit is used up");
    expect(d.detail).toMatch(/^140 emails waiting · continues automatically after /);
    expect(d.title).not.toMatch(/Sync completed/);
    expect(d.tone).toBe("waiting");
  });

  it("a user's fair share is told apart from the global limit", () => {
    const d = describeSync({ ...base, queued: 30, waitReason: "ai_share", resetsAt: "2026-10-07T07:00:00Z" }, false, NOW);
    expect(d.title).toBe("Analysis paused: your share of today's AI limit is used up");
  });

  it("the AI refusing requests is shown as a problem, with its own error", () => {
    const d = describeSync({ ...base, found: 0, queued: 120, waitReason: "ai_unavailable", waitDetail: "Gemini 400: API key not valid" }, false, NOW);
    expect(d.title).toBe("AI analysis isn't working right now");
    expect(d.detail).toBe("120 emails waiting · Gemini 400: API key not valid");
    expect(d.tone).toBe("problem");
  });

  it("batches say the rest continues", () => {
    const d = describeSync({ ...base, queued: 80, waitReason: "time_box" }, false, NOW);
    expect(d.title).toBe("Analysing your emails in batches");
    expect(d.detail).toContain("80 emails waiting · continues automatically within the hour");
    expect(d.meta).toBe(syncCounts(base));
  });

  it("an overloaded AI and an unanswered consent screen are explained too", () => {
    expect(describeSync({ ...base, queued: 5, waitReason: "ai_busy" }, false, NOW).title).toBe("The AI is busy right now");
    expect(describeSync({ ...base, queued: 5, waitReason: "ai_choice" }, false, NOW).title).toBe("Choose how Oppora reads your emails");
  });
});

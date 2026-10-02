import { describe, expect, it } from "vitest";
import { explainMatch, matchSentence } from "@/lib/domain/match";
import { createSeed, seedUser } from "@/lib/mock/seed";

const opps = createSeed(new Date(2026, 9, 2, 9, 30)).opportunities;
const byId = (id: string) => opps.find((o) => o.id === id)!;

describe("explainMatch", () => {
  it("matches interests and skills from the profile", () => {
    const r = byId("opp_amazon_frontend").matchReasons;
    expect(r.interests).toBe("met");
    expect(r.matchedInterests).toContain("frontend development");
    expect(r.skills).toBe("met");
    expect(r.matchedSkills).toEqual(["React", "TypeScript", "CSS"]);
  });
  it("is unknown when the email doesn't state eligibility or skills", () => {
    const r = byId("opp_wtm_scholarship").matchReasons;
    expect(r.skills).toBe("unknown");
    expect(r.experience).toBe("unknown");
  });
  it("recognises hackathons", () => {
    expect(byId("opp_tcs_codevita_2026").matchReasons.matchedInterests).toEqual(["hackathons"]);
  });
  it("reports unmet skills honestly", () => {
    const r = explainMatch({ title: "Data Analyst", type: "Job", skills: ["SQL"], eligibility: null }, seedUser);
    expect(r.skills).toBe("unmet");
    expect(r.interests).toBe("unmet");
  });
});

describe("matchSentence", () => {
  it("explains with interests first", () => {
    expect(matchSentence(byId("opp_amazon_frontend").matchReasons)).toBe(
      "This opportunity matches your profile because of your interest in frontend development and software engineering.",
    );
  });
  it("falls back when nothing matched", () => {
    expect(
      matchSentence({ skills: "unmet", interests: "unmet", experience: "unknown", matchedSkills: [], matchedInterests: [] }),
    ).toBe("This opportunity is only a partial match for your profile.");
  });
});

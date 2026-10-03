import type { AssistantAnswer, AssistantContext } from "@/lib/domain/assistant";
import { request } from "./client";

const NOTHING: AssistantAnswer = {
  text: "Oppora hasn't found any opportunities in your Gmail yet, so I have nothing to answer from. Run a Gmail scan and ask me again.",
  links: [],
  followUps: [],
};

/**
 * POST /api/assistant/ — the server answers only from the user's own stored
 * opportunities, emails and interviews.
 */
export function askAssistant(question: string, context: AssistantContext = {}): Promise<AssistantAnswer> {
  return request<AssistantAnswer>("/assistant", {
    method: "POST",
    body: { question, opportunityId: context.opportunityId ?? null },
    empty: () => NOTHING,
  });
}

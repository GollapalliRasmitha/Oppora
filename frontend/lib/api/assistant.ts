import { now } from "@/lib/clock";
import { answerQuestion, type AssistantAnswer, type AssistantContext } from "@/lib/domain/assistant";
import { db } from "@/lib/mock/store";
import { isEmptyMode, mock } from "./client";

/**
 * Stage 8: POST /api/assistant/ — the server answers from the user's own
 * stored opportunities and emails only. The mock uses the same contract.
 */
export function askAssistant(question: string, context: AssistantContext = {}): Promise<AssistantAnswer> {
  return mock(() => {
    const data = isEmptyMode()
      ? { opportunities: [], emails: [], interviews: [] }
      : { opportunities: db.opportunities, emails: db.emails, interviews: db.interviews };
    return answerQuestion(question, data, now(), context);
  }, 700);
}

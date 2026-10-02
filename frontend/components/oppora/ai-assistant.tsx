"use client";

import { ArrowUp, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { listOpportunities } from "@/lib/api";
import { now } from "@/lib/clock";
import { strongMatches } from "@/lib/domain/stats";
import { useResource } from "@/lib/hooks/use-resource";
import { cn } from "@/lib/utils";
import { AIOrb } from "./ai-orb";
import { useShell } from "./shell-context";

export const SUGGESTED_PROMPTS = [
  "Find internships for me",
  "What deadlines are approaching?",
  "Show high-priority opportunities",
  "Why is this opportunity relevant?",
  "What should I apply for this week?",
];

type Message = { role: "user" | "assistant"; text: string };

/** Floating Sparkles button shown on every signed-in page. */
export function FloatingAIButton() {
  const { assistantOpen, setAssistantOpen } = useShell();
  return (
    <button
      type="button"
      onClick={() => setAssistantOpen(true)}
      aria-label="Open Oppora AI assistant"
      aria-expanded={assistantOpen}
      className={cn(
        "fixed bottom-20 right-4 z-40 inline-flex size-14 items-center justify-center rounded-full bg-brand text-white focus-ring transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 md:bottom-6 md:right-6",
        "shadow-[0_0_0_1px_rgba(167,139,250,.45),0_10px_30px_-6px_rgba(124,58,237,.8)] hover:shadow-[0_0_0_1px_rgba(167,139,250,.7),0_14px_40px_-6px_rgba(96,165,250,.8)]",
        assistantOpen && "pointer-events-none opacity-0",
      )}
    >
      <Sparkles aria-hidden className="size-6" />
    </button>
  );
}

function Greeting() {
  const res = useResource(listOpportunities);
  if (res.status === "loading") return <Skeleton className="h-5 w-4/5" />;
  if (res.status === "error") return <p>Hi! I couldn&apos;t load your opportunities just now.</p>;
  const n = strongMatches(res.data, now()).length;
  return (
    <p>
      {n > 0
        ? `Hi! I found ${n} ${n === 1 ? "opportunity" : "opportunities"} that match your profile today.`
        : "Hi! I haven't found strong matches for your profile yet."}
    </p>
  );
}

export function AIAssistantPanel() {
  const { assistantOpen, setAssistantOpen } = useShell();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  const ask = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setMessages((m) => [
      ...m,
      { role: "user", text: q },
      {
        role: "assistant",
        text: "I can't answer questions yet — answers grounded in your own opportunities and emails are coming in the next update.",
      },
    ]);
    setInput("");
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(input);
  };

  return (
    <Drawer
      open={assistantOpen}
      onOpenChange={setAssistantOpen}
      title="Oppora AI"
      description="Answers only from your own opportunities and emails"
      icon={<AIOrb className="size-9" />}
      footer={
        <form onSubmit={onSubmit} className="relative">
          <label htmlFor="assistant-input" className="sr-only">
            Ask Oppora AI
          </label>
          <input
            id="assistant-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your opportunities…"
            className="h-12 w-full rounded-md border border-line bg-white/[.04] pl-4 pr-14 text-sm text-ink placeholder:text-ink-3 outline-none transition-[border-color,box-shadow] focus:border-violet/70 focus:shadow-[0_0_0_4px_rgba(124,58,237,.18)]"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!input.trim()}
            className="absolute right-1 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-sm bg-brand text-white focus-ring disabled:opacity-40"
          >
            <ArrowUp aria-hidden className="size-4" />
          </button>
        </form>
      }
    >
      <div className="space-y-4 p-5">
        <div className="ai-border relative rounded-card bg-purple/10 p-4 text-[15px] text-ink">
          <Greeting />
        </div>

        {messages.length === 0 ? (
          <div>
            <h3 className="mb-2 text-meta font-semibold uppercase tracking-wide text-ink-3">Try asking</h3>
            <ul className="space-y-2">
              {SUGGESTED_PROMPTS.map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    onClick={() => ask(p)}
                    className="flex min-h-11 w-full items-center gap-2.5 rounded-md border border-line bg-white/[.03] px-3.5 text-left text-sm font-medium text-ink-2 focus-ring transition-colors hover:border-line-strong hover:text-ink"
                  >
                    <Sparkles aria-hidden className="size-4 shrink-0 text-violet" />
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="space-y-3" aria-live="polite">
            {messages.map((m, i) => (
              <li
                key={i}
                className={cn(
                  "max-w-[85%] rounded-md px-3.5 py-2.5 text-sm",
                  m.role === "user" ? "ml-auto bg-brand text-white" : "glass text-ink-2",
                )}
              >
                {m.text}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Drawer>
  );
}

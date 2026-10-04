"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ArrowUp, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Drawer } from "@/components/ui/drawer";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { askAssistant, listOpportunities } from "@/lib/api";
import { now } from "@/lib/clock";
import { SUGGESTED_PROMPTS, type AssistantAnswer } from "@/lib/domain/assistant";
import { strongMatches } from "@/lib/domain/stats";
import { useResource } from "@/lib/hooks/use-resource";
import { isInternalHref } from "@/lib/safe-url";
import { cn } from "@/lib/utils";
import { AIOrb } from "./ai-orb";
import { isFullScreenOnMobile } from "./nav";
import { useShell } from "./shell-context";

export { SUGGESTED_PROMPTS };

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; question: string; status: "pending" | "error" }
  | { id: number; role: "assistant"; question: string; status: "done"; answer: AssistantAnswer };

/** Floating Sparkles button shown on every signed-in page. */
export function FloatingAIButton() {
  const { assistantOpen, setAssistantOpen } = useShell();
  // On full-screen mobile pages the button sits above the page's own action bar.
  const raised = isFullScreenOnMobile(usePathname());
  return (
    <button
      type="button"
      onClick={() => setAssistantOpen(true)}
      aria-label="Open Oppora AI assistant"
      aria-expanded={assistantOpen}
      className={cn(
        "fixed right-4 z-40 inline-flex size-14 items-center justify-center rounded-full bg-brand text-white focus-ring transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 md:bottom-6 md:right-6",
        "shadow-[0_0_0_1px_rgba(167,139,250,.45),0_10px_30px_-6px_var(--glow-purple)] hover:shadow-[0_0_0_1px_rgba(167,139,250,.7),0_14px_40px_-6px_rgba(96,165,250,.8)]",
        raised ? "bottom-24" : "bottom-20",
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
  if (res.status === "error") return <p>Hi! I couldn&apos;t load your opportunities just now, but you can still ask me.</p>;
  const n = strongMatches(res.data, now()).length;
  return (
    <p>
      {n > 0
        ? `Hi! I found ${n} ${n === 1 ? "opportunity" : "opportunities"} that match your profile today.`
        : "Hi! I haven't found strong matches for your profile yet."}
    </p>
  );
}

function PromptButton({ prompt, onAsk, compact }: { prompt: string; onAsk: (q: string) => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onAsk(prompt)}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-md border border-line bg-tint/[.03] px-3.5 text-left text-sm font-medium text-ink-2 focus-ring transition-colors hover:border-line-strong hover:text-ink",
        compact ? "shrink-0 rounded-full" : "w-full",
      )}
    >
      <Sparkles aria-hidden className="size-4 shrink-0 text-violet" />
      {prompt}
    </button>
  );
}

function AnswerView({ answer, onAsk, onNavigate }: { answer: AssistantAnswer; onAsk: (q: string) => void; onNavigate: () => void }) {
  return (
    <div className="space-y-3">
      <p className="whitespace-pre-line">{answer.text}</p>
      {answer.links.length > 0 && (
        <ul className="space-y-1.5" aria-label="Sources">
          {answer.links.filter((l) => isInternalHref(l.href)).map((l) => (
            <li key={l.href + l.title}>
              <Link
                href={l.href}
                onClick={onNavigate}
                className="group flex items-center gap-2 rounded-md border border-line bg-surface/70 px-3 py-2 focus-ring transition-colors hover:border-line-strong"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink group-hover:text-violet">{l.title}</span>
                  <span className="block truncate text-meta text-ink-3">{l.subtitle}</span>
                </span>
                <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-3 group-hover:text-violet" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {answer.followUps.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {answer.followUps.map((f) => (
            <PromptButton key={f} prompt={f} onAsk={onAsk} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "Oppora AI" side panel (full-screen on mobile). Answers come only from the
 * user's own opportunities and emails, and link to what they mention.
 */
export function AIAssistantPanel() {
  const { assistantOpen, setAssistantOpen } = useShell();
  const pathname = usePathname();
  const opportunityId = pathname.match(/^\/opportunities\/([^/]+)$/)?.[1] ?? null;
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = messages.some((m) => m.role === "assistant" && m.status === "pending");

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  const run = (question: string, replyId: number) => {
    askAssistant(question, { opportunityId })
      .then((answer) =>
        setMessages((ms) => ms.map((m) => (m.id === replyId ? { id: m.id, role: "assistant", question, status: "done", answer } : m))),
      )
      .catch(() => setMessages((ms) => ms.map((m) => (m.id === replyId ? { id: m.id, role: "assistant", question, status: "error" } : m))));
  };

  const ask = (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const userId = nextId.current++;
    const replyId = nextId.current++;
    setMessages((m) => [...m, { id: userId, role: "user", text: q }, { id: replyId, role: "assistant", question: q, status: "pending" }]);
    setInput("");
    run(q, replyId);
  };

  const retry = (id: number, question: string) => {
    setMessages((ms) => ms.map((m) => (m.id === id ? { id, role: "assistant", question, status: "pending" } : m)));
    run(question, id);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(input);
  };

  const close = () => setAssistantOpen(false);

  return (
    <Drawer
      open={assistantOpen}
      onOpenChange={setAssistantOpen}
      title="Oppora AI"
      description="Answers only from your own opportunities and emails"
      icon={<AIOrb className="size-9" active={busy} />}
      headerExtra={
        messages.length > 0 ? (
          <IconButton
            label="Clear conversation"
            icon={<RotateCcw aria-hidden />}
            onClick={() => {
              setMessages([]);
              toast.success("Conversation cleared");
            }}
          />
        ) : undefined
      }
      footer={
        <div className="space-y-3">
          {messages.length > 0 && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label="Suggested questions" role="group">
              {SUGGESTED_PROMPTS.map((p) => (
                <PromptButton key={p} prompt={p} onAsk={ask} compact />
              ))}
            </div>
          )}
          <form onSubmit={onSubmit} className="relative">
            <label htmlFor="assistant-input" className="sr-only">
              Ask Oppora AI
            </label>
            <input
              id="assistant-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your opportunities…"
              autoComplete="off"
              className="h-12 w-full rounded-md border border-line bg-tint/[.04] pl-4 pr-14 text-sm text-ink placeholder:text-ink-3 outline-none transition-[border-color,box-shadow] focus:border-violet/70 focus:shadow-[0_0_0_4px_rgba(124,58,237,.18)]"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={!input.trim() || busy}
              className="absolute right-1 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-sm bg-brand text-white focus-ring disabled:opacity-40"
            >
              <ArrowUp aria-hidden className="size-4" />
            </button>
          </form>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <div className="ai-border relative rounded-card bg-purple/10 p-4 text-[15px] text-ink">
          <Greeting />
        </div>

        {messages.length === 0 && (
          <div>
            <h3 className="mb-2 text-meta font-semibold uppercase tracking-wide text-ink-3">Try asking</h3>
            <ul className="space-y-2">
              {SUGGESTED_PROMPTS.map((p) => (
                <li key={p}>
                  <PromptButton prompt={p} onAsk={ask} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <ol className="space-y-3" aria-live="polite" aria-label="Conversation">
          {messages.map((m) =>
            m.role === "user" ? (
              <li key={m.id} className="ml-auto w-fit max-w-[85%] rounded-md bg-brand px-3.5 py-2.5 text-sm text-white">
                <span className="sr-only">You: </span>
                {m.text}
              </li>
            ) : (
              <li key={m.id} className="glass max-w-[95%] rounded-md px-3.5 py-3 text-sm text-ink-2">
                <span className="sr-only">Oppora AI: </span>
                {m.status === "pending" && (
                  <span className="flex items-center gap-2 text-ink-3">
                    <AIOrb className="size-4" /> Oppora AI is looking through your opportunities…
                  </span>
                )}
                {m.status === "error" && (
                  <span className="flex flex-wrap items-center gap-2">
                    I couldn&apos;t reach Oppora AI. Check your connection and try again.
                    <button
                      type="button"
                      onClick={() => retry(m.id, m.question)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 font-semibold text-violet focus-ring hover:text-ink"
                    >
                      <RefreshCw aria-hidden className="size-4" /> Retry
                    </button>
                  </span>
                )}
                {m.status === "done" && <AnswerView answer={m.answer} onAsk={ask} onNavigate={close} />}
              </li>
            ),
          )}
        </ol>
        <div ref={endRef} />
      </div>
    </Drawer>
  );
}

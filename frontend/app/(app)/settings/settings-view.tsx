"use client";

import { useRouter } from "next/navigation";
import {
  BellRing,
  CalendarClock,
  CircleCheck,
  CreditCard,
  Eye,
  Lock,
  LogOut,
  Mail,
  MailWarning,
  Newspaper,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { LoadError } from "@/components/oppora/load-error";
import { PageHeader } from "@/components/oppora/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChips, MultiChips } from "@/components/ui/filter-chips";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SwitchRow } from "@/components/ui/switch";
import { TagInput } from "@/components/ui/tag-input";
import { toast } from "@/components/ui/toast";
import {
  connectGmail,
  deleteMyData,
  disconnectGmail,
  listHiddenSenders,
  showSender,
  signOut,
  getSettings,
  updatePreferences,
  updateProfile,
  type Settings,
} from "@/lib/api";
import { formatDate } from "@/lib/domain/dates";
import { OPPORTUNITY_CATEGORIES } from "@/lib/domain/inbox";
import type { GmailConnection, HiddenSender, OpportunityType, PersonalizationLevel, Preferences, User } from "@/lib/domain/types";
import { useResource } from "@/lib/hooks/use-resource";

const SECTIONS = [
  { id: "gmail", label: "Gmail connection" },
  { id: "notifications", label: "Notifications" },
  { id: "preferences", label: "Preferences" },
  { id: "ai-preferences", label: "AI preferences" },
  { id: "account", label: "Account" },
];

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <GlassCard as="section" id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 p-5 sm:p-6">
      <h2 id={`${id}-title`} className="text-lg font-bold text-ink">
        {title}
      </h2>
      {description && <p className="mt-0.5 text-meta text-ink-3">{description}</p>}
      <div className="mt-4">{children}</div>
    </GlassCard>
  );
}

/** Senders hidden with "Hide all from this sender", with "Show again". */
function HiddenSenders() {
  const res = useResource(listHiddenSenders);
  const { mutate } = res;
  const show = async (rule: HiddenSender) => {
    mutate((list) => list.filter((r) => r.id !== rule.id));
    try {
      const restored = await showSender(rule.id);
      toast.success("Showing this sender again", {
        description: `${restored.length} ${restored.length === 1 ? "opportunity" : "opportunities"} restored from ${rule.senderEmail}.`,
      });
    } catch {
      mutate((list) => [rule, ...list]);
      toast.error("Couldn't show this sender again. Please try again.");
    }
  };
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">Hidden senders</h3>
      <p className="mt-0.5 text-meta text-ink-3">Their opportunities are hidden and new emails from them are skipped.</p>
      {res.status === "success" && res.data.length === 0 && (
        <p className="mt-2 text-sm text-ink-2">None. Use &ldquo;Hide all from this sender&rdquo; in an opportunity&apos;s ⋯ menu.</p>
      )}
      {res.status === "error" && <p className="mt-2 text-sm text-urgent">Couldn&apos;t load hidden senders.</p>}
      {res.status === "success" && res.data.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-md border border-line">
          {res.data.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{r.senderName || r.senderEmail}</p>
                <p className="truncate text-meta text-ink-3">{r.senderEmail}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => show(r)}>
                <Eye aria-hidden /> Show again
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Messages for the return trip from Google's consent screen (/settings?gmail=… or ?gmail_error=…). */
const GMAIL_RETURN: Record<string, () => void> = {
  connected: () => toast.success("Gmail connected", { description: "Use Scan Gmail to look for new opportunities." }),
  account_mismatch: () =>
    toast.error("That Google account isn't the one you're signed in with.", { description: "Choose the same account to reconnect." }),
  scope_missing: () =>
    toast.error("Oppora needs permission to read your Gmail.", { description: "Reconnect and tick the Gmail box on Google's screen." }),
};

function useGmailReturnToast() {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const key = q.get("gmail") ?? q.get("gmail_error");
    if (!key) return;
    (GMAIL_RETURN[key] ?? (() => toast.error("We couldn't connect your Gmail. Please try again.")))();
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
  }, []);
}

export function SettingsView() {
  const res = useResource(getSettings);
  const { mutate } = res;
  useGmailReturnToast();

  if (res.status === "loading") return <SettingsSkeleton />;
  if (res.status === "error")
    return (
      <>
        <PageHeader title="Settings" subtitle="Manage your account and preferences." />
        <GlassCard>
          <LoadError title="Couldn't load your settings" error={res.error} onRetry={res.reload} />
        </GlassCard>
      </>
    );

  return <SettingsContent data={res.data} mutate={mutate} />;
}

function SettingsContent({ data, mutate }: { data: Settings; mutate: (fn: (s: Settings) => Settings) => void }) {
  const { preferences: prefs } = data;

  /** Optimistic preference change with a toast and rollback. */
  const savePrefs = useCallback(
    async (patch: Parameters<typeof updatePreferences>[0], label: string) => {
      const before = data.preferences;
      mutate((s) => ({
        ...s,
        preferences: {
          ...s.preferences,
          ...patch,
          notifications: { ...s.preferences.notifications, ...patch.notifications },
          ai: { ...s.preferences.ai, ...patch.ai },
        } as Preferences,
      }));
      try {
        await updatePreferences(patch);
        toast.success("Settings saved", { description: label });
      } catch {
        mutate((s) => ({ ...s, preferences: before }));
        toast.error("Couldn't save that setting. Please try again.");
      }
    },
    [data.preferences, mutate],
  );

  const onOff = (v: boolean) => (v ? "on" : "off");

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your account and preferences." />
      <div className="grid gap-6 xl:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden xl:block">
          <ul className="sticky top-24 space-y-1">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-ink-2 focus-ring hover:bg-white/[.05] hover:text-ink">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          <GmailSection gmail={data.gmail} onChange={(gmail) => mutate((s) => ({ ...s, gmail }))} />

          <Section id="notifications" title="Notifications" description="Choose what Oppora tells you about.">
            <div className="divide-y divide-line">
              <SwitchRow
                icon={<Mail />}
                label="Email notifications"
                description="Get important updates by email as well as in the app."
                checked={prefs.notifications.email}
                onCheckedChange={(v) => savePrefs({ notifications: { email: v } }, `Email notifications ${onOff(v)}`)}
              />
              <SwitchRow
                icon={<CalendarClock />}
                label="Deadline reminders"
                description="Alerts before your deadlines close."
                checked={prefs.notifications.deadlineReminders}
                onCheckedChange={(v) => savePrefs({ notifications: { deadlineReminders: v } }, `Deadline reminders ${onOff(v)}`)}
              />
              <SwitchRow
                icon={<BellRing />}
                label="New opportunities"
                description="When Oppora finds an opportunity that matches you."
                checked={prefs.notifications.newOpportunities}
                onCheckedChange={(v) => savePrefs({ notifications: { newOpportunities: v } }, `New opportunity alerts ${onOff(v)}`)}
              />
              <SwitchRow
                icon={<Newspaper />}
                label="Weekly AI digest"
                description="A weekly summary of what Oppora found."
                checked={prefs.notifications.weeklyDigest}
                onCheckedChange={(v) => savePrefs({ notifications: { weeklyDigest: v } }, `Weekly AI digest ${onOff(v)}`)}
              />
            </div>
          </Section>

          <Section id="preferences" title="Preferences">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <span id="theme-label" className="mb-1.5 block text-sm font-semibold text-ink">
                  Theme
                </span>
                <div aria-labelledby="theme-label" className="flex h-11 items-center gap-2 rounded-md border border-line bg-white/[.04] px-4 text-sm text-ink">
                  <span aria-hidden className="size-3 rounded-full bg-bg ring-1 ring-line-strong" />
                  Dark
                </div>
                <p className="mt-1 text-meta text-ink-3">Oppora is dark-only for now.</p>
              </div>
              <div>
                <span className="mb-1.5 block text-sm font-semibold text-ink">Language</span>
                <Select label="Language" value={prefs.language} onValueChange={() => {}} options={[{ value: "en", label: "English" }]} className="w-full justify-between" />
                <p className="mt-1 text-meta text-ink-3">More languages are coming later.</p>
              </div>
              <div>
                <span className="mb-1.5 block text-sm font-semibold text-ink">Minimum match</span>
                <Select<"0" | "50" | "70" | "85">
                  label="Minimum match for new opportunities"
                  value={String(prefs.minimumMatch) as "0" | "50" | "70" | "85"}
                  onValueChange={(v) => savePrefs({ minimumMatch: Number(v) as Preferences["minimumMatch"] }, `Minimum match: ${v === "0" ? "any" : `${v}%`}`)}
                  options={[
                    { value: "0", label: "Any match" },
                    { value: "50", label: "50% or more" },
                    { value: "70", label: "70% or more" },
                    { value: "85", label: "85% or more" },
                  ]}
                  className="w-full justify-between"
                />
                <p className="mt-1 text-meta text-ink-3">Used when Oppora ranks new opportunities.</p>
              </div>
              <TagInput
                label="Preferred locations"
                description="Press Enter to add, e.g. Online or Bengaluru."
                value={prefs.preferredLocations}
                onChange={(v) => savePrefs({ preferredLocations: v }, "Preferred locations updated")}
                placeholder="Add a location"
              />
              <HiddenSenders />
            </div>
          </Section>

          <Section id="ai-preferences" title="AI preferences" description="How Oppora AI finds and ranks opportunities for you.">
            <div className="divide-y divide-line">
              <SwitchRow
                icon={<Sparkles />}
                label="AI recommendations"
                description="Show AI recommendations on Home and AI Insights, and in notifications."
                checked={prefs.ai.recommendations}
                onCheckedChange={(v) => savePrefs({ ai: { recommendations: v } }, `AI recommendations ${onOff(v)}`)}
              />
              <div className="py-4">
                <p id="personalization-label" className="text-sm font-semibold text-ink">
                  Personalization level
                </p>
                <p className="mb-2 text-meta text-ink-3">How strongly your interests and skills shape ranking.</p>
                <FilterChips<PersonalizationLevel>
                  label="Personalization level"
                  value={prefs.ai.personalization}
                  onValueChange={(v) => savePrefs({ ai: { personalization: v } }, `Personalization: ${v}`)}
                  options={[
                    { value: "low", label: "Low" },
                    { value: "balanced", label: "Balanced" },
                    { value: "high", label: "High" },
                  ]}
                />
              </div>
              <div className="pt-4">
                <p className="text-sm font-semibold text-ink">Opportunity categories to track</p>
                <p className="mb-2 text-meta text-ink-3">Oppora looks for these in your Gmail. Keep at least one.</p>
                <MultiChips<OpportunityType>
                  label="Opportunity categories to track"
                  value={prefs.ai.categories}
                  onValueChange={(v) => {
                    if (v.length === 0) {
                      toast.error("Keep at least one category", { description: "Oppora needs something to look for." });
                      return;
                    }
                    savePrefs({ ai: { categories: v } }, `Tracking ${v.length} ${v.length === 1 ? "category" : "categories"}`);
                  }}
                  options={OPPORTUNITY_CATEGORIES.map((c) => ({ value: c, label: c }))}
                />
              </div>
            </div>
          </Section>

          <AccountSection user={data.user} onUserChange={(user) => mutate((s) => ({ ...s, user }))} onDataDeleted={(gmail) => mutate((s) => ({ ...s, gmail }))} />
        </div>
      </div>
    </>
  );
}

const GMAIL_STATUS = {
  connected: { tone: "success", label: "Connected", icon: CircleCheck },
  needs_reconnect: { tone: "soon", label: "Needs reconnect", icon: TriangleAlert },
  disconnected: { tone: "neutral", label: "Disconnected", icon: MailWarning },
} as const;

function GmailSection({ gmail, onChange }: { gmail: GmailConnection; onChange: (g: GmailConnection) => void }) {
  const [manageOpen, setManageOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const status = GMAIL_STATUS[gmail.status];

  const connect = async () => {
    setWorking(true);
    try {
      onChange(await connectGmail());
      setManageOpen(false);
      toast.success("Gmail connected", { description: "Oppora will scan new emails on the next sync." });
    } catch {
      toast.error("We couldn't connect your Gmail. Please try again.");
    } finally {
      setWorking(false);
    }
  };

  const disconnect = async () => {
    setWorking(true);
    try {
      onChange(await disconnectGmail());
      setConfirmOpen(false);
      toast.success("Gmail disconnected", { description: "Access revoked and stored tokens deleted." });
    } catch {
      toast.error("We couldn't disconnect Gmail. Please try again.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Section id="gmail" title="Gmail connection" description="Oppora reads your Gmail to find opportunities. It can't send, change or delete email.">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex size-12 items-center justify-center rounded-md border border-line bg-white/[.05] text-violet">
          <Mail aria-hidden className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{gmail.email ?? "No account connected"}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>
              <status.icon aria-hidden /> {status.label}
            </Badge>
            {gmail.connectedAt && (
              <span className="text-meta text-ink-3">
                {gmail.status === "connected" ? "since" : "connected"} {formatDate(gmail.connectedAt.slice(0, 10))}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {gmail.status === "connected" ? (
            <>
              <Button variant="secondary" onClick={() => setManageOpen(true)}>
                Manage
              </Button>
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>
                Disconnect
              </Button>
            </>
          ) : (
            <Button onClick={connect} disabled={working}>
              <Mail aria-hidden /> {gmail.status === "needs_reconnect" ? "Reconnect Gmail" : "Connect Gmail"}
            </Button>
          )}
        </div>
      </div>

      <Modal
        open={manageOpen}
        onOpenChange={setManageOpen}
        title="Manage Gmail access"
        description={gmail.email ?? undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setManageOpen(false)}>
              Close
            </Button>
            <Button variant="secondary" onClick={connect} disabled={working}>
              Reconnect
            </Button>
          </>
        }
      >
        <ul className="space-y-2.5 text-sm text-ink-2">
          <li className="flex gap-2.5">
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-violet" />
            Read-only access to Gmail, plus your basic profile and email address. Oppora never asks for your Gmail password.
          </li>
          <li className="flex gap-2.5">
            <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-violet" />
            First scan covers the last {gmail.initialSyncDays} days; after that only new emails are checked.
          </li>
          <li className="flex gap-2.5">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-violet" />
            Granted permissions: {gmail.scopes.join(", ")}.
          </li>
        </ul>
      </Modal>

      <Modal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Disconnect Gmail?"
        description="Oppora will revoke its access and delete the stored sign-in tokens. It won't find new opportunities until you reconnect. Opportunities already found stay until you delete your data."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={disconnect} disabled={working}>
              Disconnect
            </Button>
          </>
        }
      />
    </Section>
  );
}

const LEVELS = ["Undergraduate student", "Postgraduate student", "Recent graduate", "Not set"] as const;

function AccountSection({
  user,
  onUserChange,
  onDataDeleted,
}: {
  user: User;
  onUserChange: (u: User) => void;
  onDataDeleted: (g: GmailConnection) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(user);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(user);

  const saveProfile = async () => {
    if (!draft.name.trim()) {
      toast.error("Please enter your name.");
      return;
    }
    setSaving(true);
    try {
      const saved = await updateProfile({
        name: draft.name.trim(),
        interests: draft.interests,
        skills: draft.skills,
        experienceLevel: draft.experienceLevel,
      });
      onUserChange(saved);
      setDraft(saved);
      toast.success("Profile saved", { description: "Match explanations now use your updated profile." });
    } catch {
      toast.error("Couldn't save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const deleteData = async () => {
    setDeleting(true);
    try {
      await deleteMyData();
      onDataDeleted({ email: user.email, status: "disconnected", connectedAt: null, scopes: [], initialSyncDays: 60 });
      setDeleteOpen(false);
      toast.success("Your data was deleted", { description: "Gmail is disconnected and nothing is stored anymore." });
      router.push("/dashboard");
    } catch {
      toast.error("Couldn't delete your data. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Section id="account" title="Account">
      <div className="space-y-6">
        {/* Profile */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-3">
            <UserRound aria-hidden className="size-4" /> Profile
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="profile-name" className="mb-1.5 block text-sm font-semibold text-ink">
                Name
              </label>
              <Input id="profile-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoComplete="name" />
            </div>
            <div>
              <label htmlFor="profile-email" className="mb-1.5 block text-sm font-semibold text-ink">
                Email
              </label>
              <Input id="profile-email" value={user.email} readOnly aria-describedby="profile-email-help" className="text-ink-2" />
              <p id="profile-email-help" className="mt-1 text-meta text-ink-3">
                From your Google account.
              </p>
            </div>
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-semibold text-ink">Experience level</span>
              <Select<(typeof LEVELS)[number]>
                label="Experience level"
                value={(draft.experienceLevel ?? "Not set") as (typeof LEVELS)[number]}
                onValueChange={(v) => setDraft({ ...draft, experienceLevel: v === "Not set" ? null : v })}
                options={LEVELS.map((l) => ({ value: l, label: l }))}
                className="w-full justify-between sm:w-72"
              />
            </div>
            <TagInput label="Interests" value={draft.interests} onChange={(interests) => setDraft({ ...draft, interests })} placeholder="Add an interest" />
            <TagInput label="Skills" value={draft.skills} onChange={(skills) => setDraft({ ...draft, skills })} placeholder="Add a skill" />
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={saveProfile} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save profile"}
            </Button>
            {dirty && (
              <Button variant="ghost" onClick={() => setDraft(user)}>
                Discard changes
              </Button>
            )}
          </div>
        </div>

        {/* Subscription */}
        <div className="border-t border-line pt-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-3">
            <CreditCard aria-hidden className="size-4" /> Subscription
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="purple">{user.plan} Plan</Badge>
            <p className="text-sm text-ink-2">Paid plans aren&apos;t available yet.</p>
          </div>
        </div>

        {/* Privacy */}
        <div className="border-t border-line pt-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-3">
            <ShieldCheck aria-hidden className="size-4" /> Privacy
          </h3>
          <p className="text-sm text-ink-2">For each relevant email, Oppora stores only:</p>
          <ul className="mt-2 grid gap-1.5 text-sm text-ink-2 sm:grid-cols-2">
            {["Message ID", "Sender", "Subject", "Date", "A short snippet", "The opportunity details it extracts"].map((x) => (
              <li key={x} className="flex items-center gap-2">
                <CircleCheck aria-hidden className="size-4 shrink-0 text-success" />
                {x}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-ink-2">
            Full email bodies are not kept after processing, and Oppora never sees your Gmail password.
          </p>
          <p className="mt-3 text-sm text-ink-2">
            To find opportunities, the subject, sender and a trimmed text version of each email that looks relevant (never
            attachments) is sent to Google Gemini. Oppora uses Gemini&apos;s free tier, where Google may use this content to
            improve its products. Emails that don&apos;t look like opportunities are never sent or stored.
          </p>
          <div className="mt-4 rounded-md border border-urgent/30 bg-urgent/[.06] p-4">
            <p className="text-sm font-semibold text-ink">Delete my data</p>
            <p className="mt-0.5 text-meta text-ink-2">
              Permanently deletes every opportunity, email record, interview and notification Oppora stored, and disconnects Gmail.
            </p>
            <Button variant="danger" className="mt-3" onClick={() => setDeleteOpen(true)}>
              <Trash2 aria-hidden /> Delete my data
            </Button>
          </div>
        </div>

        {/* Sign out */}
        <div className="border-t border-line pt-6">
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await signOut();
                toast.success("Signed out");
                router.push("/");
              } catch {
                toast.error("We couldn't sign you out. Please try again.");
              }
            }}
          >
            <LogOut aria-hidden /> Sign out
          </Button>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete all your data?"
        description="This permanently deletes every opportunity, email record, interview and notification Oppora stored, and disconnects Gmail. It can't be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={deleteData} disabled={deleting}>
              <Trash2 aria-hidden /> {deleting ? "Deleting…" : "Delete everything"}
            </Button>
          </>
        }
      />
    </Section>
  );
}

function SettingsSkeleton() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your account and preferences." />
      <div aria-busy="true" aria-label="Loading settings" className="space-y-6">
        {[3, 4, 3].map((rows, i) => (
          <GlassCard key={i} className="space-y-4 p-6">
            <Skeleton className="h-6 w-48" />
            {Array.from({ length: rows }, (_, j) => (
              <div key={j} className="flex items-center gap-3">
                <Skeleton className="size-9" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-7 w-12 rounded-full" />
              </div>
            ))}
          </GlassCard>
        ))}
      </div>
    </>
  );
}


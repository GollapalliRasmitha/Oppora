"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, LogOut, Settings, Sparkles, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { IconButton } from "@/components/ui/icon-button";
import { SearchBar } from "@/components/ui/search-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { Avatar } from "./avatar";
import { LogoMark } from "./logo";
import { hasOwnSearch } from "./nav";
import { NotificationsPanel, useNotifications } from "./notifications-panel";
import { useShell } from "./shell-context";

export function Header() {
  const router = useRouter();
  const pageHasSearch = hasOwnSearch(usePathname());
  const { user, userStatus, setAssistantOpen, notificationsOpen, setNotificationsOpen } = useShell();
  const notifications = useNotifications();
  const [q, setQ] = useState("");

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/opportunities?q=${encodeURIComponent(term)}` : "/opportunities");
  };

  const bellLabel = notifications.unread > 0 ? `Notifications, ${notifications.unread} unread` : "Notifications";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/75 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-2 px-4 sm:px-6">
        <Link href="/dashboard" aria-label="Oppora home" className="rounded-md focus-ring md:hidden">
          <LogoMark />
        </Link>

        <form onSubmit={onSearch} className={pageHasSearch ? "hidden" : "hidden max-w-xl flex-1 sm:block"}>
          <SearchBar
            value={q}
            onValueChange={setQ}
            label="Search opportunities"
            placeholder="Search opportunities, companies or keywords…"
          />
        </form>
        <div className={pageHasSearch ? "flex-1" : "flex-1 sm:hidden"} />

        <IconButton
          label={bellLabel}
          icon={<Bell aria-hidden />}
          dot={notifications.unread > 0}
          onClick={() => setNotificationsOpen(true)}
        />
        <IconButton
          label="Open Oppora AI assistant"
          icon={<Sparkles aria-hidden />}
          className="hidden text-violet sm:inline-flex"
          onClick={() => setAssistantOpen(true)}
        />

        <Dropdown>
          <DropdownTrigger aria-label="Account menu" className="inline-flex size-11 items-center justify-center rounded-full focus-ring">
            {userStatus === "loading" ? <Skeleton className="size-9 rounded-full" /> : <Avatar name={user?.name} />}
          </DropdownTrigger>
          <DropdownContent align="end">
            {user && (
              <div className="px-3 py-2">
                <div className="text-sm font-bold text-ink">{user.name}</div>
                <div className="text-meta text-ink-3">{user.plan} Plan</div>
              </div>
            )}
            <DropdownSeparator />
            <DropdownItem asChild>
              <Link href="/settings">
                <UserRound aria-hidden /> Profile
              </Link>
            </DropdownItem>
            <DropdownItem asChild>
              <Link href="/settings">
                <Settings aria-hidden /> Settings
              </Link>
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem
              onSelect={() => {
                toast.success("Signed out");
                router.push("/");
              }}
            >
              <LogOut aria-hidden /> Sign out
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>

      {/* Mobile: search gets its own sticky row */}
      <form onSubmit={onSearch} className={pageHasSearch ? "hidden" : "px-4 pb-3 sm:hidden"}>
        <SearchBar value={q} onValueChange={setQ} label="Search opportunities" placeholder="Search opportunities, companies…" />
      </form>

      <NotificationsPanel open={notificationsOpen} onOpenChange={setNotificationsOpen} state={notifications} />
    </header>
  );
}

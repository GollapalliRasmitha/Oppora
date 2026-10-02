import {
  BriefcaseBusiness,
  CalendarDays,
  CalendarClock,
  ChartPie,
  House,
  Inbox,
  Settings,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const SIDEBAR_NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/opportunities", label: "Opportunities", icon: BriefcaseBusiness },
  { href: "/deadlines", label: "Deadlines", icon: CalendarClock },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/insights", label: "AI Insights", icon: ChartPie },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const MOBILE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/opportunities", label: "Opportunities", icon: BriefcaseBusiness },
  { href: "/deadlines", label: "Deadlines", icon: CalendarClock },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/settings", label: "Profile", icon: UserRound },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Routes that take over the whole screen on mobile (no bottom nav; they bring their own action bar). */
export function isFullScreenOnMobile(pathname: string) {
  return /^\/opportunities\/[^/]+$/.test(pathname);
}

import { BriefcaseBusiness, CalendarClock, Sparkles } from "lucide-react";
import { Monogram } from "@/components/oppora/monogram";
import { cn } from "@/lib/utils";

/* Deterministic pseudo-random so server and client render the same city. */
function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

type Building = { x: number; w: number; h: number; windows: { x: number; y: number; on: boolean }[] };

function makeCity(base: number, count: number, minH: number, maxH: number, seed: number, width = 600): Building[] {
  const out: Building[] = [];
  let x = -10;
  let i = 0;
  while (x < width + 10 && i < count) {
    const w = 26 + Math.floor(rand(seed + i) * 34);
    const h = minH + Math.floor(rand(seed + i * 7) * (maxH - minH));
    const windows: Building["windows"] = [];
    for (let wy = base - h + 10; wy < base - 8; wy += 11) {
      for (let wx = x + 5; wx < x + w - 6; wx += 8) {
        windows.push({ x: wx, y: wy, on: rand(seed + wx * 3 + wy) > 0.72 });
      }
    }
    out.push({ x, w, h, windows });
    x += w + 2 + Math.floor(rand(seed + i * 13) * 6);
    i++;
  }
  return out;
}

const FAR = makeCity(420, 30, 60, 170, 11);
const NEAR = makeCity(430, 24, 90, 260, 47);
const STARS = Array.from({ length: 40 }, (_, i) => ({
  x: Math.round(rand(i + 300) * 600),
  y: Math.round(rand(i + 600) * 220),
  r: rand(i + 900) > 0.85 ? 1.4 : 0.8,
}));

function FloatCard({ className, delay, children }: { className?: string; delay: string; children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      style={{ animationDelay: delay }}
      className={cn(
        "glass-strong absolute flex animate-float items-center gap-2.5 rounded-md bg-surface/85 p-2.5 pr-3.5 text-left shadow-[0_18px_40px_-16px_rgba(0,0,0,.8),0_0_24px_-8px_rgba(124,58,237,.6)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Original hero illustration: a student seen from behind at a desk, facing a
 * futuristic city, with orbital lines, a glowing AI orb and floating cards.
 */
export function HeroIllustration() {
  return (
    <div
      role="img"
      aria-label="Illustration: a student at a desk looks out over a glowing city while Oppora's AI orb surfaces new opportunities and deadlines."
      className="relative mx-auto aspect-[600/560] w-full max-w-[600px]"
    >
      <svg viewBox="0 0 600 560" className="absolute inset-0 size-full [mask-image:radial-gradient(closest-side,#000_58%,transparent_100%)]" aria-hidden>
        <defs>
          <radialGradient id="h-sky" cx="50%" cy="38%" r="65%">
            <stop offset="0" stopColor="#5b21b6" stopOpacity=".75" />
            <stop offset=".45" stopColor="#1e1b5e" stopOpacity=".7" />
            <stop offset="1" stopColor="#070a1a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="h-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3b2a8a" />
            <stop offset="1" stopColor="#1a1a52" />
          </linearGradient>
          <linearGradient id="h-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1d1650" />
            <stop offset="1" stopColor="#0b0d2a" />
          </linearGradient>
          <linearGradient id="h-orbit" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7c3aed" stopOpacity="0" />
            <stop offset=".35" stopColor="#a78bfa" />
            <stop offset=".7" stopColor="#60a5fa" />
            <stop offset="1" stopColor="#f472b6" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="h-orb" cx="38%" cy="32%" r="70%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".22" stopColor="#ddd6fe" />
            <stop offset=".55" stopColor="#8b5cf6" />
            <stop offset=".85" stopColor="#2563eb" />
            <stop offset="1" stopColor="#1e1b5e" />
          </radialGradient>
          <radialGradient id="h-orb-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#a78bfa" stopOpacity=".65" />
            <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="h-desk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a2370" />
            <stop offset=".15" stopColor="#141238" />
            <stop offset="1" stopColor="#070a1a" />
          </linearGradient>
          <radialGradient id="h-screen" cx="50%" cy="100%" r="60%">
            <stop offset="0" stopColor="#93c5fd" stopOpacity=".55" />
            <stop offset="1" stopColor="#60a5fa" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="h-person" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#14123a" />
            <stop offset="1" stopColor="#07081c" />
          </linearGradient>
          <linearGradient id="h-rim" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#f472b6" />
            <stop offset=".5" stopColor="#a78bfa" />
            <stop offset="1" stopColor="#60a5fa" />
          </linearGradient>
          <filter id="h-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <rect width="600" height="560" fill="url(#h-sky)" />

        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#c7d2fe" opacity=".55" />
        ))}

        {/* Orbital lines */}
        <g fill="none" strokeLinecap="round">
          <ellipse cx="300" cy="240" rx="290" ry="86" transform="rotate(-12 300 240)" stroke="url(#h-orbit)" strokeWidth="1.4" opacity=".55" />
          <ellipse cx="300" cy="250" rx="230" ry="56" transform="rotate(9 300 250)" stroke="url(#h-orbit)" strokeWidth="1" strokeDasharray="4 8" opacity=".5" />
        </g>

        {/* Far city */}
        <g opacity=".75">
          {FAR.map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={420 - b.h} width={b.w} height={b.h} fill="url(#h-far)" />
              {b.windows.filter((w) => w.on).map((w, j) => (
                <rect key={j} x={w.x} y={w.y} width="3" height="4" fill="#c4b5fd" opacity=".55" />
              ))}
            </g>
          ))}
        </g>

        {/* AI orb */}
        <g>
          <circle cx="430" cy="150" r="80" fill="url(#h-orb-glow)" />
          <ellipse cx="430" cy="150" rx="66" ry="16" transform="rotate(-18 430 150)" fill="none" stroke="#a78bfa" strokeOpacity=".6" strokeWidth="1.2" />
          <circle cx="430" cy="150" r="30" fill="url(#h-orb)" />
          <path d="M430 136c1.1 7 3.7 10 10.4 11.6-6.7 1.6-9.3 4.6-10.4 11.6-1.1-7-3.7-10-10.4-11.6 6.7-1.6 9.3-4.6 10.4-11.6Z" fill="#fff" opacity=".9" />
        </g>

        {/* Near city */}
        {NEAR.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={430 - b.h} width={b.w} height={b.h} fill="url(#h-near)" />
            <rect x={b.x} y={430 - b.h} width={b.w} height="1.5" fill="#a78bfa" opacity=".5" />
            {b.windows.filter((w) => w.on).map((w, j) => (
              <rect key={j} x={w.x} y={w.y} width="3" height="5" fill={j % 5 === 0 ? "#f9a8d4" : "#93c5fd"} opacity=".7" />
            ))}
          </g>
        ))}

        {/* Desk */}
        <rect x="0" y="438" width="600" height="122" fill="url(#h-desk)" />
        <rect x="0" y="438" width="600" height="1.5" fill="#a78bfa" opacity=".55" />
        <ellipse cx="300" cy="446" rx="150" ry="22" fill="url(#h-screen)" />

        {/* Laptop glow behind the student */}
        <rect x="236" y="398" width="128" height="44" rx="4" fill="#60a5fa" opacity=".35" filter="url(#h-blur)" />

        {/* Student, seen from behind */}
        <g>
          {/* rim light */}
          <g filter="url(#h-blur)" opacity=".8">
            <path d="M196 560c4-70 30-112 70-124 10-3 20-14 22-26h24c2 12 12 23 22 26 40 12 66 54 70 124Z" fill="none" stroke="url(#h-rim)" strokeWidth="6" />
            <circle cx="300" cy="352" r="44" fill="none" stroke="url(#h-rim)" strokeWidth="6" />
          </g>
          {/* body */}
          <path d="M196 560c4-70 30-112 70-124 10-3 20-14 22-26h24c2 12 12 23 22 26 40 12 66 54 70 124Z" fill="url(#h-person)" />
          {/* hair, falling past the shoulders */}
          <path
            d="M256 352c0-28 19-48 44-48s44 20 44 48c0 22-3 44 6 72 4 12-2 22-14 24-12 2-24-4-36-4s-24 6-36 4c-12-2-18-12-14-24 9-28 6-50 6-72Z"
            fill="url(#h-person)"
          />
          <path
            d="M256 352c0-28 19-48 44-48s44 20 44 48c0 22-3 44 6 72 4 12-2 22-14 24"
            fill="none"
            stroke="url(#h-rim)"
            strokeWidth="1.6"
            opacity=".85"
          />
          <path d="M256 352c0 22 3 44-6 72-4 12 2 22 14 24" fill="none" stroke="#f472b6" strokeWidth="1.2" opacity=".6" />
        </g>
      </svg>

      {/* Floating glass cards */}
      <FloatCard className="left-0 top-[14%] sm:left-[2%]" delay="0s">
        <Monogram name="Google" size="sm" />
        <div>
          <div className="text-xs font-semibold text-ink-3">Google Careers</div>
          <div className="text-sm font-bold text-ink">Summer Internship 2027</div>
        </div>
      </FloatCard>

      <FloatCard className="bottom-[4%] right-0 sm:bottom-auto sm:right-[4%] sm:top-[4%]" delay="1.2s">
        <span className="flex size-8 items-center justify-center rounded-md bg-pink/15 text-pink">
          <CalendarClock className="size-4" />
        </span>
        <div className="text-sm font-bold text-ink">4 deadlines this week</div>
      </FloatCard>

      <FloatCard className="right-0 top-[48%] hidden sm:flex" delay="0.6s">
        <span className="flex size-8 items-center justify-center rounded-md bg-purple/20 text-violet">
          <Sparkles className="size-4" />
        </span>
        <div>
          <div className="text-xs font-semibold text-violet">New opportunity found</div>
          <div className="text-sm font-bold text-ink">Frontend Developer</div>
          <div className="text-xs text-ink-3">Amazon</div>
        </div>
      </FloatCard>

      <FloatCard className="bottom-[24%] left-[3%]" delay="1.8s">
        <span className="flex size-8 items-center justify-center rounded-md bg-blue/15 text-blue">
          <BriefcaseBusiness className="size-4" />
        </span>
        <div>
          <div className="text-xs font-semibold text-ink-3">Application deadline</div>
          <div className="text-sm font-bold text-ink">15 Dec</div>
        </div>
      </FloatCard>
    </div>
  );
}

import { Link, useRouterState } from "@tanstack/react-router";
import { Home, ArrowLeftRight, CreditCard, Sparkles, PieChart } from "lucide-react";
import type { ReactNode } from "react";

const nav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/pay", label: "Pay", icon: ArrowLeftRight },
  { to: "/cards", label: "Cards", icon: CreditCard },
  { to: "/insights", label: "Insights", icon: PieChart },
  { to: "/assistant", label: "Star", icon: Sparkles },
] as const;

export function MobileShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-dvh mx-auto max-w-[440px] bg-background text-foreground relative">
      <div className="pb-28">{children}</div>
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[440px] px-4 pb-4 pt-2 pointer-events-none z-40">
        <div className="pointer-events-auto surface-elevated rounded-full backdrop-blur-xl px-2 py-2 flex items-center justify-between shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
          {nav.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? path === "/" : path.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-full transition-all ${
                  active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className={`relative flex items-center justify-center h-8 w-8 rounded-full transition-all ${active ? "gold-gradient shadow-[0_6px_20px_-6px_var(--gold)]" : ""}`}>
                  <Icon className="h-4 w-4" strokeWidth={active ? 2.4 : 1.8} />
                </div>
                <span className={`text-[10px] tracking-wide ${active ? "text-foreground font-medium" : ""}`}>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="px-5 pt-6 pb-4 flex items-start justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{subtitle ?? "StarCore"}</p>
        <h1 className="text-display text-3xl mt-1">{title}</h1>
      </div>
      {right}
    </header>
  );
}

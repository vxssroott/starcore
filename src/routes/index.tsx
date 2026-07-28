import { createFileRoute, Link } from "@tanstack/react-router";
import { MobileShell } from "@/components/starcore/MobileShell";
import { StarLogo } from "@/components/starcore/StarLogo";
import { accounts, transactions, fmt, fmtCompact, beneficiaries, insights } from "@/lib/mock-data";
import {
  ArrowUpRight, ArrowDownLeft, Plus, Send, QrCode, Zap, Eye, EyeOff, Bell,
  ChevronRight, Sparkles, Shield, TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StarCore — Banking. Reimagined." },
      { name: "description", content: "A premium digital bank built for Africa and the world. Beautiful, fast, intelligent, secure." },
      { property: "og:title", content: "StarCore — Banking. Reimagined." },
      { property: "og:description", content: "Move money, manage cards, and understand your finances — all in one elegant app." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const [hidden, setHidden] = useState(false);
  const total = accounts.filter(a => a.currency === "NGN").reduce((s, a) => s + a.balance, 0);
  const recent = transactions.slice(0, 5);

  return (
    <MobileShell>
      {/* Top bar */}
      <div className="px-5 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full gold-gradient grid place-items-center text-primary-foreground font-semibold">
            A
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Good evening</p>
            <p className="text-sm font-medium">Adaeze Okonkwo</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-10 w-10 rounded-full surface-elevated grid place-items-center">
            <Bell className="h-4 w-4" />
          </button>
          <StarLogo size={28} />
        </div>
      </div>

      {/* Balance card */}
      <section className="px-5 mt-6">
        <div className="card-obsidian rounded-3xl p-6 relative overflow-hidden">
          <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full opacity-30 blur-3xl gold-gradient" />
          <div className="flex items-center justify-between relative">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total balance</p>
            <button onClick={() => setHidden(v => !v)} className="text-muted-foreground hover:text-foreground">
              {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-3 relative">
            <div className="flex items-baseline gap-2">
              <span className="text-display text-5xl tracking-tight">
                {hidden ? "••••••" : fmtCompact(total).replace(/^./, "")}
              </span>
              <span className="text-xs text-muted-foreground">NGN</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Across {accounts.length} accounts</p>
          </div>
          <div className="h-16 -mx-6 -mb-2 mt-3 relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={insights.balanceSeries}>
                <defs>
                  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke="var(--gold)" strokeWidth={1.5} fill="url(#bg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-3 relative text-xs">
            <span className="flex items-center gap-1 text-[var(--success)]">
              <TrendingUp className="h-3 w-3" /> +8.2% this month
            </span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">Tier 3 verified</span>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          {[
            { icon: Send, label: "Send", to: "/pay" },
            { icon: QrCode, label: "Scan", to: "/pay" },
            { icon: Zap, label: "Bills", to: "/pay" },
            { icon: Plus, label: "Top up", to: "/pay" },
          ].map(({ icon: Icon, label, to }) => (
            <Link key={label} to={to} className="surface-elevated rounded-2xl py-3 flex flex-col items-center gap-1.5 hover:border-[var(--gold)]/40 transition">
              <div className="h-9 w-9 rounded-full bg-[var(--surface-3)] grid place-items-center">
                <Icon className="h-4 w-4 text-[var(--gold-soft)]" />
              </div>
              <span className="text-[11px] text-muted-foreground">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Ask Star teaser */}
      <section className="px-5 mt-5">
        <Link to="/assistant" className="block relative overflow-hidden rounded-2xl hairline p-4 bg-gradient-to-br from-[var(--surface-2)] to-[var(--surface)]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full gold-gradient grid place-items-center">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Ask Star</p>
              <p className="text-xs text-muted-foreground">"Where did my salary go this month?"</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </Link>
      </section>

      {/* Accounts */}
      <section className="mt-6">
        <div className="px-5 flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium tracking-wide">Accounts</h2>
          <button className="text-xs text-muted-foreground flex items-center gap-1">View all <ChevronRight className="h-3 w-3" /></button>
        </div>
        <div className="flex gap-3 overflow-x-auto no-scrollbar px-5 pb-1">
          {accounts.map(a => (
            <div key={a.id} className="min-w-[220px] surface-elevated rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{a.type}</span>
                <span className={`h-2 w-2 rounded-full ${a.color === "gold" ? "bg-[var(--gold)]" : a.color === "emerald" ? "bg-[var(--success)]" : a.color === "navy" ? "bg-[var(--chart-3)]" : "bg-[var(--foreground)]/40"}`} />
              </div>
              <p className="mt-2 text-sm font-medium">{a.name}</p>
              <p className="text-mono text-[11px] text-muted-foreground">{a.number}</p>
              <p className="text-display text-2xl mt-3">{fmt(a.balance, a.currency)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Beneficiaries */}
      <section className="mt-6 px-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium tracking-wide">Send to</h2>
        </div>
        <div className="flex gap-4 overflow-x-auto no-scrollbar">
          <button className="flex flex-col items-center gap-1.5 min-w-[56px]">
            <div className="h-12 w-12 rounded-full hairline grid place-items-center border-dashed">
              <Plus className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-[11px] text-muted-foreground">New</span>
          </button>
          {beneficiaries.map(b => (
            <button key={b.id} className="flex flex-col items-center gap-1.5 min-w-[56px]">
              <div className="h-12 w-12 rounded-full bg-[var(--surface-3)] grid place-items-center text-sm font-medium">{b.avatar}</div>
              <span className="text-[11px] text-muted-foreground truncate max-w-[64px]">{b.name.split(" ")[0]}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Transactions */}
      <section className="mt-6 px-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium tracking-wide">Recent activity</h2>
          <button className="text-xs text-muted-foreground">This week</button>
        </div>
        <div className="surface-elevated rounded-2xl divide-y divide-[var(--border)]">
          {recent.map(t => {
            const positive = t.amount > 0;
            return (
              <div key={t.id} className="p-4 flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full grid place-items-center ${positive ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--surface-3)] text-foreground"}`}>
                  {positive ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.title}</p>
                  <p className="text-[11px] text-muted-foreground">{t.category} • {t.method}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm text-mono ${positive ? "text-[var(--success)]" : "text-foreground"}`}>
                    {positive ? "+" : ""}{fmt(t.amount)}
                  </p>
                  {t.status === "pending" && (
                    <p className="text-[10px] text-[var(--warning)]">Pending</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Security ribbon */}
      <section className="mt-6 px-5">
        <div className="hairline rounded-2xl p-4 flex items-center gap-3 bg-[var(--surface)]/50">
          <Shield className="h-4 w-4 text-[var(--gold)]" />
          <p className="text-xs text-muted-foreground">
            Signed in on <span className="text-foreground">iPhone 16 Pro • Lagos</span>. Passkey enabled.
          </p>
        </div>
      </section>
    </MobileShell>
  );
}

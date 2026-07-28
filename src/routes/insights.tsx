import { createFileRoute } from "@tanstack/react-router";
import { MobileShell, ScreenHeader } from "@/components/starcore/MobileShell";
import { insights, goals, fmt } from "@/lib/mock-data";
import { TrendingUp, TrendingDown, Target, Sparkles } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from "recharts";

export const Route = createFileRoute("/insights")({
  head: () => ({
    meta: [
      { title: "Insights — StarCore" },
      { name: "description", content: "Financial health score, spending breakdown, cash flow, and savings goals — powered by StarCore intelligence." },
      { property: "og:title", content: "Insights — StarCore" },
      { property: "og:description", content: "See where your money goes, and where it's headed next." },
    ],
  }),
  component: Insights,
});

function Insights() {
  const delta = insights.spendThisMonth - insights.spendLastMonth;
  const pct = ((delta / insights.spendLastMonth) * 100).toFixed(1);
  const up = delta > 0;

  return (
    <MobileShell>
      <ScreenHeader title="Insights" subtitle="This month" />

      {/* Score */}
      <section className="px-5">
        <div className="card-obsidian rounded-3xl p-6 flex items-center gap-5">
          <div className="relative h-24 w-24">
            <svg viewBox="0 0 100 100" className="-rotate-90">
              <circle cx="50" cy="50" r="42" stroke="var(--surface-3)" strokeWidth="8" fill="none" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke="url(#g)" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${(insights.score / 100) * 263.9} 263.9`}
              />
              <defs>
                <linearGradient id="g" x1="0" x2="1">
                  <stop offset="0" stopColor="var(--gold-soft)" />
                  <stop offset="1" stopColor="var(--gold-deep)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <span className="text-display text-2xl">{insights.score}</span>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Financial health</p>
            <p className="text-display text-xl mt-1">Excellent</p>
            <p className="text-xs text-muted-foreground mt-1">You're saving 32% of income. Keep it up.</p>
          </div>
        </div>
      </section>

      {/* Spend vs last */}
      <section className="px-5 mt-4 grid grid-cols-2 gap-3">
        <div className="surface-elevated rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Spent</p>
          <p className="text-display text-2xl mt-1">{fmt(insights.spendThisMonth)}</p>
          <p className={`text-[11px] mt-1 flex items-center gap-1 ${up ? "text-[var(--warning)]" : "text-[var(--success)]"}`}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {pct}% vs last
          </p>
        </div>
        <div className="surface-elevated rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Income</p>
          <p className="text-display text-2xl mt-1">{fmt(insights.income)}</p>
          <p className="text-[11px] mt-1 text-muted-foreground">Salary + freelance</p>
        </div>
      </section>

      {/* Categories */}
      <section className="px-5 mt-5">
        <div className="surface-elevated rounded-2xl p-5">
          <h3 className="text-sm font-medium">Where it went</h3>
          <div className="flex items-center gap-4 mt-3">
            <div className="h-32 w-32 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={insights.categories} dataKey="value" innerRadius={38} outerRadius={60} stroke="none">
                    {insights.categories.map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">Total</p>
                  <p className="text-display text-sm">₦612k</p>
                </div>
              </div>
            </div>
            <ul className="flex-1 space-y-2">
              {insights.categories.slice(0, 5).map(c => (
                <li key={c.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                  <span className="flex-1 text-muted-foreground">{c.name}</span>
                  <span className="text-mono">{fmt(c.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Cash flow */}
      <section className="px-5 mt-5">
        <div className="surface-elevated rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Cash flow</h3>
            <span className="text-[11px] text-muted-foreground">Weekly, ₦'000s</span>
          </div>
          <div className="h-40 -mx-2 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={insights.cashflow}>
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                <Tooltip cursor={{ fill: "var(--surface-3)" }} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="in" fill="var(--gold)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="out" fill="var(--surface-3)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Goals */}
      <section className="px-5 mt-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Savings goals</h3>
          <button className="text-xs gold-text">Add goal</button>
        </div>
        <div className="space-y-3">
          {goals.map(g => {
            const p = (g.saved / g.target) * 100;
            return (
              <div key={g.id} className="surface-elevated rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-[var(--surface-3)] grid place-items-center">
                    <Target className="h-4 w-4 text-[var(--gold-soft)]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{g.name}</p>
                    <p className="text-[11px] text-muted-foreground">ETA {g.eta}</p>
                  </div>
                  <p className="text-mono text-sm">{Math.round(p)}%</p>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
                  <div className="h-full gold-gradient" style={{ width: `${p}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 text-mono">{fmt(g.saved)} / {fmt(g.target)}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Suggestion */}
      <section className="px-5 mt-5">
        <div className="rounded-2xl p-4 hairline bg-gradient-to-br from-[var(--surface-2)] to-[var(--surface)] flex gap-3">
          <Sparkles className="h-4 w-4 text-[var(--gold)] shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Star noticed you spend <span className="text-foreground">₦54k/mo on subscriptions</span>. Cancelling 2 unused ones could save you <span className="gold-text font-medium">₦21k</span> monthly.
          </p>
        </div>
      </section>
    </MobileShell>
  );
}

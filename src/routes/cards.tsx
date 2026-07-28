import { createFileRoute } from "@tanstack/react-router";
import { MobileShell, ScreenHeader } from "@/components/starcore/MobileShell";
import { cards, fmt } from "@/lib/mock-data";
import { Snowflake, Flame, Plus, Globe, ShoppingBag, Settings2, Eye, Wifi } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/cards")({
  head: () => ({
    meta: [
      { title: "Cards — StarCore" },
      { name: "description", content: "Physical and virtual cards with granular controls, spending analytics, and one-tap freezing." },
      { property: "og:title", content: "Cards — StarCore" },
      { property: "og:description", content: "Freeze, unfreeze, set limits, control merchants — all in real time." },
    ],
  }),
  component: Cards,
});

function Cards() {
  const [i, setI] = useState(0);
  const card = cards[i];
  const [frozen, setFrozen] = useState(card.frozen);
  const controls = [
    { icon: Globe, label: "International", on: true },
    { icon: ShoppingBag, label: "Online", on: true },
    { icon: Wifi, label: "Contactless", on: true },
    { icon: Eye, label: "Show number" },
  ];

  return (
    <MobileShell>
      <ScreenHeader
        title="Cards"
        subtitle="Physical & virtual"
        right={
          <button className="h-10 w-10 rounded-full gold-gradient grid place-items-center text-primary-foreground shadow-[0_10px_30px_-10px_var(--gold)]">
            <Plus className="h-4 w-4" />
          </button>
        }
      />

      {/* Card carousel */}
      <section className="px-5">
        <div className="relative aspect-[1.6/1] rounded-3xl overflow-hidden card-obsidian p-5 flex flex-col justify-between">
          <div className="absolute inset-0 gold-gradient opacity-[0.06]" />
          <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full blur-3xl gold-gradient opacity-25" />
          <div className="flex items-start justify-between relative">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">StarCore</p>
              <p className="text-display text-xl mt-1">{card.label}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{card.type}</p>
              <p className="text-xs mt-1 gold-text">{card.network}</p>
            </div>
          </div>
          <div className="relative">
            <p className="text-mono text-lg tracking-[0.3em]">•••• •••• •••• {card.last4}</p>
            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
              <span>Adaeze Okonkwo</span>
              <span className="text-mono">12/29</span>
            </div>
          </div>
          {frozen && (
            <div className="absolute inset-0 bg-background/70 backdrop-blur-sm grid place-items-center">
              <div className="flex flex-col items-center gap-1">
                <Snowflake className="h-6 w-6 text-[var(--chart-3)]" />
                <p className="text-xs text-muted-foreground">Card frozen</p>
              </div>
            </div>
          )}
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-1.5 mt-4">
          {cards.map((_, idx) => (
            <button
              key={idx}
              onClick={() => { setI(idx); setFrozen(cards[idx].frozen); }}
              className={`h-1.5 rounded-full transition-all ${idx === i ? "w-6 bg-[var(--gold)]" : "w-1.5 bg-[var(--surface-3)]"}`}
            />
          ))}
        </div>
      </section>

      {/* Primary control */}
      <section className="px-5 mt-5 grid grid-cols-2 gap-3">
        <button
          onClick={() => setFrozen(v => !v)}
          className={`rounded-2xl p-4 flex items-center gap-3 transition ${frozen ? "gold-gradient text-primary-foreground" : "surface-elevated"}`}
        >
          {frozen ? <Flame className="h-4 w-4" /> : <Snowflake className="h-4 w-4 text-[var(--chart-3)]" />}
          <span className="text-sm font-medium">{frozen ? "Unfreeze" : "Freeze card"}</span>
        </button>
        <button className="rounded-2xl p-4 flex items-center gap-3 surface-elevated">
          <Settings2 className="h-4 w-4 text-[var(--gold-soft)]" />
          <span className="text-sm font-medium">Limits & rules</span>
        </button>
      </section>

      {/* Spend */}
      <section className="px-5 mt-5">
        <div className="surface-elevated rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Spent this month</span>
            <span>Limit {fmt(card.limit)}</span>
          </div>
          <p className="text-display text-3xl mt-1">{fmt(card.spent)}</p>
          <div className="mt-3 h-1.5 w-full rounded-full bg-[var(--surface-3)] overflow-hidden">
            <div className="h-full gold-gradient" style={{ width: `${Math.min(100, (card.spent / card.limit) * 100)}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[
              { l: "Groceries", v: 42 },
              { l: "Transport", v: 18 },
              { l: "Dining", v: 27 },
            ].map(x => (
              <div key={x.l} className="rounded-xl bg-[var(--surface)] p-3">
                <p className="text-display text-xl">{x.v}%</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{x.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Controls */}
      <section className="px-5 mt-5">
        <h2 className="text-sm font-medium mb-3">Controls</h2>
        <div className="surface-elevated rounded-2xl divide-y divide-[var(--border)]">
          {controls.map(({ icon: Icon, label, on }) => (
            <div key={label} className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-[var(--surface-3)] grid place-items-center">
                <Icon className="h-4 w-4 text-[var(--gold-soft)]" />
              </div>
              <span className="text-sm flex-1">{label}</span>
              {on !== undefined ? (
                <div className={`h-6 w-10 rounded-full p-0.5 transition ${on ? "gold-gradient" : "bg-[var(--surface-3)]"}`}>
                  <div className={`h-5 w-5 rounded-full bg-background transition ${on ? "translate-x-4" : ""}`} />
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">›</span>
              )}
            </div>
          ))}
        </div>
      </section>
    </MobileShell>
  );
}

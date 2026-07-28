import { createFileRoute } from "@tanstack/react-router";
import { MobileShell, ScreenHeader } from "@/components/starcore/MobileShell";
import { beneficiaries, fmt } from "@/lib/mock-data";
import { Search, Send, QrCode, Users, Zap, Phone, Wifi, Tv, GraduationCap, Landmark, Repeat, Building2, ArrowRight, Sparkles } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/pay")({
  head: () => ({
    meta: [
      { title: "Pay — StarCore" },
      { name: "description", content: "Send money, pay bills, and split expenses instantly on StarCore." },
      { property: "og:title", content: "Pay — StarCore" },
      { property: "og:description", content: "Instant transfers, bills, and QR payments." },
    ],
  }),
  component: Pay,
});

const primary = [
  { icon: Send, label: "Send", desc: "To any bank in seconds" },
  { icon: QrCode, label: "Scan", desc: "Pay a merchant with QR" },
  { icon: Users, label: "Request", desc: "Split & get paid back" },
  { icon: Repeat, label: "Recurring", desc: "Standing orders" },
];

const bills = [
  { icon: Zap, label: "Electricity" },
  { icon: Wifi, label: "Internet" },
  { icon: Tv, label: "Cable TV" },
  { icon: Phone, label: "Airtime & Data" },
  { icon: GraduationCap, label: "Education" },
  { icon: Landmark, label: "Government" },
  { icon: Building2, label: "Rent" },
  { icon: Repeat, label: "Bulk pay" },
];

function Pay() {
  const [amount, setAmount] = useState("50,000");
  const [to, setTo] = useState(beneficiaries[0]);

  return (
    <MobileShell>
      <ScreenHeader title="Pay" subtitle="Move money" />

      {/* Composer */}
      <section className="px-5">
        <div className="card-obsidian rounded-3xl p-6">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Sending</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-display text-5xl">₦</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-transparent outline-none text-display text-5xl w-full tracking-tight"
              inputMode="decimal"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">From Everyday • {fmt(8_432_910)}</p>

          <div className="mt-5 flex items-center justify-between rounded-2xl bg-[var(--surface-3)]/60 p-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-[var(--surface-2)] grid place-items-center text-sm font-medium">{to.avatar}</div>
              <div>
                <p className="text-sm font-medium">{to.name}</p>
                <p className="text-[11px] text-muted-foreground text-mono">{to.bank} • {to.number}</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>

          <button className="mt-4 w-full gold-gradient text-primary-foreground rounded-full py-3.5 font-medium flex items-center justify-center gap-2 shadow-[0_20px_50px_-20px_var(--gold)]">
            <Send className="h-4 w-4" /> Send instantly
          </button>
          <p className="text-[11px] text-muted-foreground text-center mt-2">Free • Confirm with Face ID</p>
        </div>
      </section>

      {/* Search */}
      <section className="px-5 mt-5">
        <label className="flex items-center gap-3 hairline rounded-full bg-[var(--surface)] px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input placeholder="Name, bank, phone, tag…" className="bg-transparent outline-none text-sm flex-1 placeholder:text-muted-foreground" />
          <Sparkles className="h-4 w-4 text-[var(--gold)]" />
        </label>
      </section>

      {/* Primary actions */}
      <section className="px-5 mt-5">
        <div className="grid grid-cols-2 gap-3">
          {primary.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="surface-elevated rounded-2xl p-4">
              <div className="h-9 w-9 rounded-full bg-[var(--surface-3)] grid place-items-center">
                <Icon className="h-4 w-4 text-[var(--gold-soft)]" />
              </div>
              <p className="mt-3 text-sm font-medium">{label}</p>
              <p className="text-[11px] text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Recent beneficiaries */}
      <section className="px-5 mt-6">
        <h2 className="text-sm font-medium mb-3">Frequent</h2>
        <div className="surface-elevated rounded-2xl divide-y divide-[var(--border)]">
          {beneficiaries.map(b => (
            <button key={b.id} onClick={() => setTo(b)} className="w-full p-4 flex items-center gap-3 text-left hover:bg-[var(--surface-2)]/60">
              <div className="h-10 w-10 rounded-full bg-[var(--surface-3)] grid place-items-center text-sm font-medium">{b.avatar}</div>
              <div className="flex-1">
                <p className="text-sm font-medium">{b.name}</p>
                <p className="text-[11px] text-muted-foreground text-mono">{b.bank} • {b.number}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </section>

      {/* Bills */}
      <section className="px-5 mt-6">
        <h2 className="text-sm font-medium mb-3">Pay a bill</h2>
        <div className="grid grid-cols-4 gap-2">
          {bills.map(({ icon: Icon, label }) => (
            <button key={label} className="surface-elevated rounded-2xl py-3 flex flex-col items-center gap-1.5">
              <div className="h-9 w-9 rounded-full bg-[var(--surface-3)] grid place-items-center">
                <Icon className="h-4 w-4 text-[var(--gold-soft)]" />
              </div>
              <span className="text-[10px] text-muted-foreground text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </section>
    </MobileShell>
  );
}

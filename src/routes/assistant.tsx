import { createFileRoute } from "@tanstack/react-router";
import { MobileShell } from "@/components/starcore/MobileShell";
import { StarLogo } from "@/components/starcore/StarLogo";
import { useState, useRef, useEffect } from "react";
import { Send, Mic, Sparkles } from "lucide-react";
import { fmt } from "@/lib/mock-data";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "Ask Star — StarCore" },
      { name: "description", content: "Your intelligent banking assistant. Ask anything — move money, freeze cards, understand your spending." },
      { property: "og:title", content: "Ask Star — StarCore" },
      { property: "og:description", content: "Banking, in plain language." },
    ],
  }),
  component: Assistant,
});

type Msg = { id: string; role: "user" | "star"; content: React.ReactNode; text: string };

const suggestions = [
  "Where did my salary go?",
  "Freeze my subscriptions card",
  "Send ₦50,000 to David",
  "Can I afford ₦2M vacation?",
  "Biggest expenses this month",
];

const canned: Record<string, React.ReactNode> = {
  salary: (
    <div className="space-y-3">
      <p>Here's the breakdown of your <span className="gold-text font-medium">₦1,250,000</span> salary this month:</p>
      <div className="rounded-xl bg-[var(--surface-3)]/50 p-3 space-y-2 text-xs">
        {[
          ["Bills & utilities", 148000],
          ["Groceries", 132000],
          ["Dining out", 96000],
          ["Transport", 72000],
          ["Subscriptions", 54400],
          ["Saved to Vault", 400000],
          ["Remaining in Everyday", 347600],
        ].map(([l, v]) => (
          <div key={l as string} className="flex justify-between">
            <span className="text-muted-foreground">{l}</span>
            <span className="text-mono">{fmt(v as number)}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">You saved 32% — above your 25% target. Nice.</p>
    </div>
  ),
  freeze: (
    <div className="space-y-3">
      <p>Done. <span className="text-foreground font-medium">Subscriptions card •• 1188</span> is now frozen. No charges will go through until you unfreeze.</p>
      <button className="rounded-full hairline px-4 py-2 text-xs">Unfreeze</button>
    </div>
  ),
  send: (
    <div className="space-y-3">
      <p>Ready to send <span className="gold-text font-medium">₦50,000</span> to <span className="text-foreground">David Okafor</span> at StarCore.</p>
      <div className="rounded-xl bg-[var(--surface-3)]/50 p-3 text-xs space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">From</span><span>Everyday • 8891</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Fee</span><span>Free</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Arrival</span><span>Instant</span></div>
      </div>
      <button className="w-full gold-gradient text-primary-foreground rounded-full py-2.5 text-sm font-medium">Confirm with Face ID</button>
    </div>
  ),
  afford: (
    <div className="space-y-2">
      <p>Yes — comfortably.</p>
      <p className="text-xs text-muted-foreground">Based on your last 6 months, you can spend <span className="gold-text">₦2M</span> and still keep 4 months of runway. Best window: <span className="text-foreground">Feb–Apr 2027</span>, after your Vault matures.</p>
    </div>
  ),
  biggest: (
    <div className="space-y-3">
      <p>Your top 3 categories this month:</p>
      <div className="space-y-2">
        {[["Food & Drink", 148000, 62], ["Groceries", 132000, 55], ["Transport", 92000, 38]].map(([l, v, w]) => (
          <div key={l as string}>
            <div className="flex justify-between text-xs"><span>{l}</span><span className="text-mono">{fmt(v as number)}</span></div>
            <div className="h-1.5 mt-1 rounded-full bg-[var(--surface-3)]"><div className="h-full gold-gradient rounded-full" style={{ width: `${w}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  ),
};

function respond(text: string): React.ReactNode {
  const t = text.toLowerCase();
  if (t.includes("salary") || t.includes("where did")) return canned.salary;
  if (t.includes("freeze")) return canned.freeze;
  if (t.includes("send") || t.includes("₦") || t.includes("transfer")) return canned.send;
  if (t.includes("afford")) return canned.afford;
  if (t.includes("biggest") || t.includes("expenses")) return canned.biggest;
  return <p>I can help with transfers, cards, spending analysis, budgets, and predictions. Try one of the suggestions below.</p>;
}

function Assistant() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "welcome",
      role: "star",
      text: "hi",
      content: (
        <div className="space-y-1">
          <p>Hi Adaeze. I'm Star.</p>
          <p className="text-muted-foreground text-xs">Ask me anything about your money.</p>
        </div>
      ),
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const id = crypto.randomUUID();
    setMessages(m => [...m, { id, role: "user", text, content: <p>{text}</p> }]);
    setInput("");
    setTyping(true);
    setTimeout(() => {
      setMessages(m => [...m, { id: crypto.randomUUID(), role: "star", text, content: respond(text) }]);
      setTyping(false);
    }, 700);
  };

  return (
    <MobileShell>
      <div className="px-5 pt-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full gold-gradient grid place-items-center shadow-[0_10px_30px_-10px_var(--gold)]">
          <StarLogo size={20} />
        </div>
        <div>
          <p className="text-display text-xl leading-none">Star</p>
          <p className="text-[11px] text-muted-foreground mt-1">Your banking assistant • Online</p>
        </div>
      </div>

      <div ref={scrollRef} className="mt-5 px-5 space-y-3 overflow-y-auto" style={{ maxHeight: "calc(100dvh - 260px)" }}>
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                m.role === "user"
                  ? "gold-gradient text-primary-foreground rounded-br-md"
                  : "surface-elevated rounded-bl-md"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex">
            <div className="surface-elevated rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)] animate-pulse" />
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)] animate-pulse [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)] animate-pulse [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-[440px] px-5 z-30">
        {messages.length <= 1 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3">
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => send(s)}
                className="shrink-0 hairline rounded-full px-3 py-1.5 text-xs bg-[var(--surface)]/80 backdrop-blur hover:border-[var(--gold)]/40"
              >
                <Sparkles className="h-3 w-3 inline mr-1 text-[var(--gold)]" />
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="surface-elevated rounded-full flex items-center gap-2 pl-4 pr-2 py-2 backdrop-blur-xl"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Star anything…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            autoFocus
          />
          <button type="button" className="h-8 w-8 grid place-items-center text-muted-foreground">
            <Mic className="h-4 w-4" />
          </button>
          <button type="submit" className="h-9 w-9 rounded-full gold-gradient grid place-items-center text-primary-foreground">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </MobileShell>
  );
}

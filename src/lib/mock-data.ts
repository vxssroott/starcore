export type Account = {
  id: string;
  name: string;
  type: "Current" | "Savings" | "Joint" | "Fixed Deposit" | "USD";
  number: string;
  balance: number;
  currency: string;
  color: string;
};

export type Txn = {
  id: string;
  title: string;
  merchant: string;
  category: string;
  amount: number; // negative = debit
  date: string; // ISO
  status: "completed" | "pending" | "declined";
  method: string;
  accountId: string;
  icon?: string;
};

export const accounts: Account[] = [
  { id: "a1", name: "Everyday", type: "Current", number: "0221 4477 8891", balance: 8_432_910, currency: "NGN", color: "gold" },
  { id: "a2", name: "Vault", type: "Savings", number: "0221 4477 8892", balance: 3_120_500, currency: "NGN", color: "emerald" },
  { id: "a3", name: "Family", type: "Joint", number: "0221 4477 8893", balance: 1_845_200, currency: "NGN", color: "navy" },
  { id: "a4", name: "Reserve", type: "Fixed Deposit", number: "0221 4477 8894", balance: 12_000_000, currency: "NGN", color: "onyx" },
  { id: "a5", name: "Global", type: "USD", number: "0221 4477 8895", balance: 24_180.42, currency: "USD", color: "gold" },
];

export const cards = [
  { id: "c1", label: "StarCore Metal", last4: "4477", type: "Physical", network: "Visa Infinite", frozen: false, spent: 412000, limit: 2500000 },
  { id: "c2", label: "Everyday Virtual", last4: "9021", type: "Virtual", network: "Mastercard", frozen: false, spent: 88500, limit: 500000 },
  { id: "c3", label: "Subscriptions", last4: "1188", type: "Virtual", network: "Mastercard", frozen: true, spent: 24500, limit: 100000 },
];

const now = new Date();
const d = (offset: number) => new Date(now.getTime() - offset * 3600_000).toISOString();

export const transactions: Txn[] = [
  { id: "t1", title: "Salary — Meridian Capital", merchant: "Meridian Capital", category: "Income", amount: 1_250_000, date: d(3), status: "completed", method: "Transfer in", accountId: "a1" },
  { id: "t2", title: "Nomad Coffee", merchant: "Nomad Coffee", category: "Food & Drink", amount: -4800, date: d(6), status: "completed", method: "Card • 4477", accountId: "a1" },
  { id: "t3", title: "David Okafor", merchant: "David Okafor", category: "Transfers", amount: -50000, date: d(9), status: "completed", method: "Instant • StarCore", accountId: "a1" },
  { id: "t4", title: "Netflix", merchant: "Netflix", category: "Subscriptions", amount: -6500, date: d(24), status: "completed", method: "Card • 1188", accountId: "a1" },
  { id: "t5", title: "Ikeja Electric", merchant: "IKEDC", category: "Utilities", amount: -18000, date: d(30), status: "completed", method: "Bill Pay", accountId: "a1" },
  { id: "t6", title: "Uber", merchant: "Uber", category: "Transport", amount: -7200, date: d(46), status: "completed", method: "Card • 9021", accountId: "a1" },
  { id: "t7", title: "Whole Foods Lekki", merchant: "Whole Foods", category: "Groceries", amount: -42300, date: d(52), status: "completed", method: "Card • 4477", accountId: "a1" },
  { id: "t8", title: "Amara Nwosu", merchant: "Amara Nwosu", category: "Transfers", amount: 30000, date: d(70), status: "completed", method: "Received", accountId: "a1" },
  { id: "t9", title: "Apple iCloud", merchant: "Apple", category: "Subscriptions", amount: -1600, date: d(90), status: "completed", method: "Card • 1188", accountId: "a1" },
  { id: "t10", title: "MTN Data", merchant: "MTN", category: "Airtime & Data", amount: -5000, date: d(110), status: "completed", method: "Bill Pay", accountId: "a1" },
  { id: "t11", title: "Chinedu (Split — Dinner)", merchant: "Chinedu", category: "Transfers", amount: 12500, date: d(120), status: "pending", method: "Request", accountId: "a1" },
  { id: "t12", title: "Domiciliary FX — USD", merchant: "StarCore FX", category: "Transfers", amount: -180000, date: d(140), status: "completed", method: "Exchange", accountId: "a1" },
];

export const beneficiaries = [
  { id: "b1", name: "David Okafor", bank: "StarCore", number: "0221 88 4471", avatar: "D" },
  { id: "b2", name: "Amara Nwosu", bank: "GTBank", number: "0221 55 1102", avatar: "A" },
  { id: "b3", name: "Chinedu Eze", bank: "StarCore", number: "0221 88 9910", avatar: "C" },
  { id: "b4", name: "Zainab Bello", bank: "Access", number: "0044 21 7788", avatar: "Z" },
  { id: "b5", name: "Tunde Alabi", bank: "StarCore", number: "0221 88 4402", avatar: "T" },
];

export const goals = [
  { id: "g1", name: "Emergency Fund", saved: 850_000, target: 2_000_000, eta: "Mar 2027" },
  { id: "g2", name: "Tokyo, 2027", saved: 320_000, target: 1_500_000, eta: "Jun 2027" },
  { id: "g3", name: "New Laptop", saved: 240_000, target: 900_000, eta: "Sep 2026" },
];

export const insights = {
  score: 82,
  spendThisMonth: 612_400,
  spendLastMonth: 548_200,
  income: 1_250_000,
  categories: [
    { name: "Food & Drink", value: 148_000, color: "var(--gold)" },
    { name: "Transport", value: 92_000, color: "var(--chart-2)" },
    { name: "Groceries", value: 132_000, color: "var(--chart-3)" },
    { name: "Subscriptions", value: 54_400, color: "var(--chart-4)" },
    { name: "Utilities", value: 88_000, color: "var(--chart-5)" },
    { name: "Other", value: 98_000, color: "var(--gold-deep)" },
  ],
  cashflow: [
    { day: "W1", in: 320, out: 140 },
    { day: "W2", in: 180, out: 210 },
    { day: "W3", in: 950, out: 240 },
    { day: "W4", in: 220, out: 190 },
    { day: "W5", in: 140, out: 90 },
  ],
  balanceSeries: Array.from({ length: 30 }).map((_, i) => ({
    d: i + 1,
    v: 6_500_000 + Math.round(Math.sin(i / 3) * 400_000 + i * 45_000 + Math.random() * 200_000),
  })),
};

export const fmt = (n: number, currency = "NGN") => {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (currency === "USD") return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${sign}₦${abs.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
};

export const fmtCompact = (n: number, currency = "NGN") => {
  const sym = currency === "USD" ? "$" : "₦";
  return `${sym}${Math.abs(n).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
};

(updated) src/routes/pay.tsx
@@
 function Pay() {
   const [amount, setAmount] = useState("50,000");
   const [to, setTo] = useState(beneficiaries[0]);
+  const [loading, setLoading] = useState(false);
+  const [statusMessage, setStatusMessage] = useState<string | null>(null);
@@
-          <button className="mt-4 w-full gold-gradient text-primary-foreground rounded-full py-3.5 font-medium flex items-center justify-center gap-2 shadow-[0_20px_50px_-20px_var(--gold)]">
-            <Send className="h-4 w-4" /> Send instantly
-          </button>
+          <button
+            disabled={loading}
+            onClick={async () => {
+              setLoading(true);
+              setStatusMessage(null);
+              try {
+                // parse amount (remove non-digits)
+                const numeric = Number(String(amount).replace(/[^0-9.-]+/g, ''));
+                if (!numeric || numeric <= 0) throw new Error('invalid amount');
+
+                // create idempotency key for safety
+                const idempotencyKey = (typeof crypto !== 'undefined' && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : String(Date.now());
+
+                const createRes = await fetch('/api/transfer/create', {
+                  method: 'POST',
+                  headers: { 'content-type': 'application/json' },
+                  body: JSON.stringify({ fromAccountId: 'account:default', toAccountId: to.id, amount: numeric, currency: 'NGN', provider: 'bank:default', idempotencyKey }),
+                });
+                const createJson = await createRes.json();
+                if (!createRes.ok) throw new Error(createJson.error || 'failed to create intent');
+
+                const intentId = createJson.intent?.id;
+                if (!intentId) throw new Error('no intent id returned');
+
+                setStatusMessage('Processing transfer...');
+
+                const execRes = await fetch('/api/transfer/execute', {
+                  method: 'POST',
+                  headers: { 'content-type': 'application/json' },
+                  body: JSON.stringify({ intentId, provider: 'bank:default' }),
+                });
+                const execJson = await execRes.json();
+                if (!execRes.ok) throw new Error(execJson.error || 'failed to execute intent');
+
+                setStatusMessage('Transfer submitted. Check activity for status.');
+              } catch (err: any) {
+                console.error(err);
+                setStatusMessage(String(err?.message ?? err));
+                alert('Transfer failed: ' + String(err?.message ?? err));
+              } finally {
+                setLoading(false);
+              }
+            }}
+            className="mt-4 w-full gold-gradient text-primary-foreground rounded-full py-3.5 font-medium flex items-center justify-center gap-2 shadow-[0_20px_50px_-20px_var(--gold)]"
+          >
+            <Send className="h-4 w-4" /> {loading ? 'Sending...' : 'Send instantly'}
+          </button>
+          {statusMessage && <p className="text-[12px] text-center mt-2">{statusMessage}</p>}

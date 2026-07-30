// test/integration/payments.test.ts

import pool from '../../src/db';
import { createCustomer, createLedgerAccount, createAccount, getWallet } from '../../src/services/accountService';
import { createPaymentIntent, executePaymentIntent, getTransfersForAccount } from '../../src/services/payments';
import { createTransaction } from '../../src/services/ledger';

describe('Payments engine integration', () => {
  const ownerA = '00000000-0000-0000-0000-000000000010';
  const ownerB = '00000000-0000-0000-0000-000000000011';
  let ledgerA: any;
  let ledgerB: any;
  let accountA: any;
  let accountB: any;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set for integration tests');

    await createCustomer(ownerA, 'Alice');
    await createCustomer(ownerB, 'Bob');

    ledgerA = await createLedgerAccount(ownerA, 'USD', 'Alice Ledger');
    ledgerB = await createLedgerAccount(ownerB, 'USD', 'Bob Ledger');

    accountA = await createAccount(ownerA, ledgerA.id, 'USD');
    accountB = await createAccount(ownerB, ledgerB.id, 'USD');

    // Seed Alice with $200.00 (20000 cents)
    await createTransaction(ledgerA.id, 20000, 'USD', 'seed', { note: 'initial funding' }, 'posted');
  });

  afterAll(async () => {
    await pool.end();
  });

  test('internal transfer: create intent and execute', async () => {
    const intent = await createPaymentIntent(null, 'corr-1', accountA.id, accountB.id, 5000, 'USD', false, { note: 'pay invoice' });
    expect(intent).toBeDefined();
    expect(intent.status).toBe('authorized');

    const transfer = await executePaymentIntent(intent.id);
    expect(transfer).toBeDefined();
    expect(transfer.status).toBe('completed' || 'processing' || 'completed');
    expect(Number(transfer.amount)).toBe(5000);

    // balances: Alice -5000, Bob +5000
    const walletA = await getWallet(accountA.id);
    const walletB = await getWallet(accountB.id);

    expect(Number(walletA.ledger_balance)).toBe(20000 - 5000);
    expect(Number(walletB.ledger_balance)).toBe(5000);

    const transfersForA = await getTransfersForAccount(accountA.id, 10);
    expect(transfersForA.length).toBeGreaterThan(0);
  });
});

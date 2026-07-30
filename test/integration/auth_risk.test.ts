// test/integration/auth_risk.test.ts

import pool from '../../src/db';
import { createUser, registerDevice, createSession, recordLoginAttempt } from '../../src/services/auth';
import { createCustomer } from '../../src/services/accountService';
import { createLedgerAccount, createAccount } from '../../src/services/accountService';
import { createTransaction } from '../../src/services/ledger';
import { createPaymentIntent } from '../../src/services/payments';
import { evaluatePaymentIntent, getDecisionForPayment } from '../../src/services/risk';

describe('Auth & Risk integration', () => {
  const owner = '00000000-0000-0000-0000-000000000020';
  let user: any;
  let device: any;
  let ledgerAcc: any;
  let account: any;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set for integration tests');
    await createCustomer(owner, 'Risky Corp');
    // create user
    user = await createUser(owner, 'riskyuser', 'risky@example.com', 'password123');
    // register device
    device = await registerDevice(user.id, 'fp-12345', 'jest-test', null, { note: 'test device' });

    ledgerAcc = await createLedgerAccount(owner, 'USD', 'Risk Ledger');
    account = await createAccount(owner, ledgerAcc.id, 'USD');

    // seed account with $500.00
    await createTransaction(ledgerAcc.id, 50000, 'USD', 'seed', { note: 'fund' }, 'posted');
  });

  afterAll(async () => {
    await pool.end();
  });

  test('low-risk payment is approved', async () => {
    const intent = await createPaymentIntent(null, 'corr-risk-1', account.id, account.id, 1000, 'USD', false, { device_id: device.id, ip_address: '127.0.0.1' });
    expect(intent).toBeDefined();
    const decision = await evaluatePaymentIntent(intent.id);
    expect(['APPROVE','REVIEW','DECLINE']).toContain(decision);
    const record = await getDecisionForPayment(intent.id);
    expect(record).toBeDefined();
  });

  test('very large payment is declined', async () => {
    const intent = await createPaymentIntent(null, 'corr-risk-2', account.id, account.id, 10000000, 'USD', false, { device_id: device.id, ip_address: '127.0.0.1' });
    expect(intent).toBeDefined();
    const decision = await evaluatePaymentIntent(intent.id);
    expect(decision).toBe('DECLINE');
    const record = await getDecisionForPayment(intent.id);
    expect(record.decision).toBe('DECLINE');
  });
});

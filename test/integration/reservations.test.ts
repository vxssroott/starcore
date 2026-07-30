// test/integration/reservations.test.ts

/**
 * Integration test for reservations and account wallet behaviour.
 *
 * Requirements:
 * - Set DATABASE_URL env var to a test Postgres database.
 * - Run migrations before executing (or allow tests to run migrations).
 */

import pool from '../../src/db';
import { createCustomer, createLedgerAccount, createAccount, getWallet } from '../../src/services/accountService';
import { createReservation, captureReservation, releaseReservation } from '../../src/services/reservationService';

describe('Reservations integration', () => {
  const ownerId = '00000000-0000-0000-0000-000000000001';
  let ledgerAccount: any;
  let account: any;
  let reservation: any;

  beforeAll(async () => {
    // Ensure DB connection
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set for integration tests');

    // create customer, ledger account and account
    await createCustomer(ownerId, 'Test User');
    ledgerAccount = await createLedgerAccount(ownerId, 'USD', 'Test Ledger');
    account = await createAccount(ownerId, ledgerAccount.id, 'USD');
  });

  afterAll(async () => {
    await pool.end();
  });

  test('create reservation, partial capture, release, and wallet balances', async () => {
    // Create a reservation for $10.00 (1000 cents)
    reservation = await createReservation(account.id, 1000, null, { reason: 'auth' });
    expect(reservation).toBeDefined();

    // Wallet should show reserved balance = 1000, available reduced accordingly
    let wallet = await getWallet(account.id);
    expect(wallet.reserved_balance).toBe(1000);
    // Ledger balance is zero initially
    expect(wallet.ledger_balance).toBe(0);
    expect(wallet.available_balance).toBe(-1000);

    // Partial capture: capture $4.00 (400 cents)
    const tx = await captureReservation(reservation.id, 400, 'capture', { note: 'partial' });
    expect(tx).toBeDefined();

    wallet = await getWallet(account.id);
    expect(wallet.ledger_balance).toBe(-400);
    expect(wallet.reserved_balance).toBe(600);
    expect(wallet.available_balance).toBe(-1000 + 400); // ledger - reserved => -400

    // Release remaining $6.00
    const released = await releaseReservation(reservation.id, 600);
    expect(released).toBeDefined();

    wallet = await getWallet(account.id);
    expect(wallet.reserved_balance).toBe(0);
    expect(wallet.available_balance).toBe(-400);
  });
});

// tests/integration/reporting.test.ts
// Integration test skeleton for the reporting subsystem.

import { Pool } from 'pg';
import { ReportingService } from '../../src/services/reportingService';

describe('Reporting integration tests (placeholder)', () => {
  let pool: Pool;
  let svc: ReportingService;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    svc = new ReportingService(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test('generateStatement should create a statement metadata row', async () => {
    const id = await svc.generateStatement({
      tenantId: '00000000-0000-0000-0000-000000000000',
      accountId: '00000000-0000-0000-0000-000000000000',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      type: 'monthly',
    });
    expect(id).toBeDefined();
  }, 20000);
});

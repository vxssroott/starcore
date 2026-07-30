# Architectural notes

Architecture
- Ledger remains the single source of truth. Reporting reads from ledger views and payments tables.
- The reporting schema stores only metadata and append-only history (statements, jobs, exports, templates, history).
- No derived balances are stored. Use ledger sequences captured at generation time to provide stable snapshots.

Performance
- Use keyset pagination (seek-based) on reporting endpoints; queries should filter by tenant_id + account_id + date ranges.
- Indexes created on tenant/account + start/end dates and seq fields to support queries without full-table scans.
- Reporting cache table is provided for pre-computed expensive aggregations.
- For large transaction volumes consider partitioning statement_exports and report_history by generated_at or tenant_id.

Security & Data
- Exports are referenced by storage_key/url but actual files should live in object storage (S3/MinIO) and served via pre-signed URLs.
- Export download counts are tracked in statement_exports.downloaded_count using an increment function.

CQRS
- The system treats ledger as write model; reporting is a read model. All exports and reports are generated from ledger snapshots.


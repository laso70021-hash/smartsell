# DukaPro — Engineering, Security & Product Rules
> **Project:** DukaPro — multi-tenant retail operations SaaS. **Status:** Proposed specification derived from supplied UI references; not an audit of deployed code, database, integrations, or business claims.
> **Existing project rule:** Inspect and extend the current application. Preserve Vite + React + TypeScript + Tailwind CSS + shadcn/ui. Use the connected backend already configured in the repository; Supabase is the target only where it is actually the existing backend. Never silently migrate frameworks, databases, or auth.
> **Visual authority:** Supplied dark DukaPro screenshots for current dashboard screens; the ten-panel composite for landing, platform admin, owner, cashier POS, inventory, sales, customers, suppliers, expenses and settings. Where references differ, retain established working flows and unify tokens without deleting features.

## Non-negotiables
1. **Audit before editing.** Inventory routes, UI components, database tables, RLS, integrations, feature flags and existing business logic. Document the delta.
2. **Extend, never rebuild.** No forced Next.js migration, no duplicate authentication system, no replacement of existing functional modules.
3. **Real persistence only.** All production records originate from the existing authorized backend. Never present hardcoded dashboard figures, mock orders or simulated payment confirmations.
4. **Tenant isolation.** Every business-owned row is linked to its actual tenant. Branch membership and access are checked server-side. Never trust selected business IDs, role labels or localStorage as authorization.
5. **Role enforcement.** Platform admin is separate from owner/manager/supervisor/cashier. Use least privilege. Hide forbidden actions in UI AND block them in backend/RLS.
6. **Financial correctness.** Use currency-aware decimal-safe amounts; immutable sale-line snapshots, refunds, discounts, taxes, receivables, supplier payables and ledger entries. No floating-point money calculations.
7. **Inventory correctness.** Use atomic server-side stock operations with transaction IDs, movement history and idempotency keys. Prevent double decrements, negative stock unless explicitly permitted, and unauthorized cross-branch transfers.
8. **Honest status.** Distinguish draft, submitted, approved, settled, failed, refunded and cancelled. A payment claim is not settlement.
9. **Secure secrets.** Never expose service-role keys, gateway secrets or privileged credentials to the browser. Use trusted server functions for privileged operations.
10. **Accessible UX.** Keyboard-operable navigation, visible focus, proper form labels, responsive tables, WCAG-aware contrast in both themes, non-color status cues.
11. **Traceability.** Audit sensitive changes: stock, roles, prices, credits, refunds, tax settings, branch status, subscriptions, account deletion.
12. **No destructive cleanup.** Trial cleanup must preview scope, require explicit authorization, preserve legally required records and be reversible where feasible. No deletion merely because a trial expires.
13. **No fake marketing.** Display verified usage/uptime/customer claims only; otherwise remove them.
14. **No fake integration.** Disabled or unavailable payment, WhatsApp, fiscalization, email, barcode, scanner or PWA features must be explicitly labelled until verified.
15. **Production readiness.** Tests and RLS verification are required before a feature is marked complete.

## Definition of done per module
- Route works for permitted roles, including refresh/deep-link and mobile layout.
- Reads, creates, edits and authorized deletes persist in the actual backend; no demo fallback.
- All filters/search/sort/pagination use consistent backend data.
- Loading, empty, error, success and permission-denied states are implemented.
- Cross-tenant and cross-branch access tests fail securely.
- Concurrent write and retry tests pass for money and stock.
- Audit logs, exports, documents and derived metrics reconcile with source records.
- Theme renders correctly in both modes, with dark as first-visit default.

## Implementation agent instruction
Before any change, state the existing files/schema inspected, the smallest intended modifications, security impact and acceptance tests. After each phase, list changed files, migrations, tests, blockers and genuine verified outcomes. Never claim success from UI appearance alone.

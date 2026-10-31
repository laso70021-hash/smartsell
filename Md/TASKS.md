# DukaPro — Prioritized Implementation Tasks
> **Project:** DukaPro — multi-tenant retail operations SaaS. **Status:** Proposed specification derived from supplied UI references; not an audit of deployed code, database, integrations, or business claims.
> **Existing project rule:** Inspect and extend the current application. Preserve Vite + React + TypeScript + Tailwind CSS + shadcn/ui. Use the connected backend already configured in the repository; Supabase is the target only where it is actually the existing backend. Never silently migrate frameworks, databases, or auth.
> **Visual authority:** Supplied dark DukaPro screenshots for current dashboard screens; the ten-panel composite for landing, platform admin, owner, cashier POS, inventory, sales, customers, suppliers, expenses and settings. Where references differ, retain established working flows and unify tokens without deleting features.

**Status:** All boxes remain unchecked until verified against the existing codebase and backend. Do not interpret screenshots as implementation proof.

## Phase 0 — Audit & mapping (blocking)
- [ ] Inspect current repository, router, components, dependencies, theme, auth, database client and deployment configuration.
- [ ] Map all supplied screenshots to existing routes/components; classify working, partial, missing, duplicate and dead links.
- [ ] Inspect live schema/RLS/storage and business/branch relationships; preserve real data.
- [ ] Identify current payment, tax, notification, PWA, CSV and subscription integrations; document gaps.
- [ ] Produce migration plan, rollback and test fixtures with two tenants and several roles.

## Phase 1 — Design and navigation
- [ ] Extract/reference palette; add semantic dark/light tokens; set dark as first-visit default.
- [ ] Build consistent public, admin, business and POS layouts without replacing existing functional shells.
- [ ] Implement sidebar nested states, mobile drawer, role-aware nav and real route transitions.
- [ ] Build top bar with branch/business context, theme, notifications, account menu and legitimate subscription banner.
- [ ] Implement common loading, empty, error, confirm, filter, table and chart primitives.

## Phase 2 — Identity, tenancy, branches, staff
- [ ] Validate real signup/login/logout/password update and user profile.
- [ ] Create/verify business onboarding and default branch creation.
- [ ] Enforce tenant RLS, branch access, role permissions and platform admin separation.
- [ ] Implement branch CRUD and branch switcher; invalidate cached queries on switch.
- [ ] Implement staff invitations, permissions, assignment and revocation.
- [ ] Verify two-tenant and unauthorized-role negative tests.

## Phase 3 — Catalog & inventory
- [ ] Product/category/SKU/barcode CRUD and image upload, tied to tenant.
- [ ] Branch inventory, units/variants and threshold configuration.
- [ ] Stock movement ledger, top-up, adjustment, transfers and stocktake.
- [ ] Inventory search/sort/filter, history and CSV import validation/export.
- [ ] Low-stock alerts, action buttons, print/share and accurate export scope.
- [ ] Test concurrent stock edits, retry idempotency and quantity precision.

## Phase 4 — Cashier POS & sales
- [ ] Build cashier mode product search, cart, customer, tax, discount and tender UX.
- [ ] Implement trusted atomic sale commit, receipt numbering and inventory deduction.
- [ ] Implement payment evidence/verification, refunds, returns and voids with permissions.
- [ ] Implement shift and cash drawer tracking where included.
- [ ] Test duplicate submits, insufficient stock, failed payment and branch isolation.

## Phase 5 — Suppliers, purchases & expenses
- [ ] Supplier CRUD and supplier transaction history.
- [ ] Purchase orders, goods receipt, returns and supplier payable ledger.
- [ ] Expense categories, expenses, recurrence and approvals if enabled.
- [ ] Reconcile supplier balances, purchase reports and inventory receipt totals.

## Phase 6 — Customers & receivables
- [ ] Customer CRUD, history, statement and permission-safe export.
- [ ] Credit settings, limits, receivable ledger and partial allocations.
- [ ] Aging, reminders and reconciliation; no editable balance shortcuts.

## Phase 7 — Dashboard, reports, transactions
- [ ] Compute dashboard cards from canonical sales/inventory/ledger data.
- [ ] Build stock status, unit distribution, sales trend and recent-sales charts.
- [ ] Build reporting views with date/branch filters, drilldowns and exports.
- [ ] Build transaction log All/Suppliers/Customers/Products with period Apply and branch filters.
- [ ] Ensure activity events reference real source records and match exported values.

## Phase 8 — Settings & optional capabilities
- [ ] Persist business profile, currency/locale, logo/branding and document preferences.
- [ ] Add operating mode and entitlement-aware variant, service, restaurant, credit, wallet, variable-price and divisible-goods toggles.
- [ ] Implement profile appearance, password and safe deletion-request workflow.
- [ ] Implement trial cleanup preview with authorization, retention and audit controls.

## Phase 9 — Platform admin, subscriptions & public site
- [ ] Implement platform admin tenant/user/branch/product/sales/subscription views with verified aggregations.
- [ ] Implement plan entitlements, trial lifecycle, real offer eligibility and payment status.
- [ ] Implement landing page, pricing, FAQs, registration CTAs and verified marketing claims.
- [ ] Add support, audit logs, system status and operations tooling.

## Phase 10 — Quality gates & release
- [ ] Test all primary roles and two tenants; deny cross-tenant/branch access.
- [ ] Reconcile POS→inventory→financial reporting and purchasing→payables.
- [ ] Verify light/dark screenshots at desktop/tablet/mobile; keyboard and screen-reader checks.
- [ ] Verify real downloads, imports, notifications and payment integrations.
- [ ] Load-test large catalogs and report pagination; verify backup and rollback.
- [ ] Remove hardcoded counters and misleading placeholders; document any unavailable integration.
- [ ] Produce signed-off route/feature matrix and evidence-based release notes.

# Implementation record — 31 October 2026

## Current Supabase cutover status

The browser client now uses Supabase Auth and the authenticated `smartsell_identity`, `smartsell_onboard`, `smartsell_workspace`, and `smartsell_command` RPCs. The browser has no SQLite or mock-data fallback. CSV export generation and downloads also use the cloud workspace/command path rather than `/api` endpoints. `npm run dev` and `npm start` now serve only the frontend; the Express/SQLite implementation remains for legacy workflow tests and optional local-only use.

This is not yet a completed production cutover. The hosted database's checked-in RPC/schema predates features added to the SQLite application: fractional/variant inventory, restaurant workflows, business category, manager-wide branch edits, and team role/member edits. These operations need reviewed additive Supabase migrations and authenticated acceptance tests before they can be advertised as supported with the cloud backend. No service-role key is used in the browser.

The hosted project `qislzkmdfrkelihuklid` was inspected in the authenticated Supabase Dashboard. Its public schema contained the Smartsell core objects and 14 tables created by `saino_*` migrations. After the user confirmed a restorable backup and authorized removal of those exact tables, they were dropped with `RESTRICT` and without `CASCADE`. Verification found zero remaining candidate tables, 16 Smartsell-prefixed tables, the receipt-template table and RPC intact, and no foreign keys crossing between the two table groups. The generic table names came from Saino migrations, not Smartsell naming mistakes, so none were renamed.

The receipt-template migration was applied through the SQL Editor and verified: its table has RLS enabled, direct authenticated table reads are denied, only the authenticated RPC can be called, and the signed-in Smartsell app successfully loaded the saved-template list. Template save/default writes were not exercised to avoid creating or changing business data during validation. The receipt migration is not yet registered in `supabase_migrations.schema_migrations`; reconcile migration history before a future CLI push to avoid a redundant re-run. The table cleanup was also issued directly in the Dashboard and has no checked-in cleanup migration yet; add a reviewed migration before recreating the project from its historical Saino migration set.

## Document templates — initial receipt phase

The existing receipt was an actual-sale modal with print styling, but had no template library or reusable brand configuration. The new Settings → Document Templates page adds eight receipt design presets and an editable receipt-specific interface for colors, font, paper width, header layout, footer, and business logo. Changes are presentation-only. Preview uses the latest authorized branch sale when available and labels generated sample content as preview-only. Receipt output uses the saved default template and actual sale, branch, customer, cashier, item, payment, and total fields from the workspace. It does not generate a verification QR or represent itself as a fiscal receipt.

Tenant-owned saved templates use the additive migration in `supabase/migrations/20261031100642_smartsell_document_templates.sql`. That SQL enables RLS, revokes direct table access, exposes only a guarded RPC, derives the tenant from `private.ss_member()`, and limits writes/default selection to business owners. It was applied to the hosted project through the authenticated SQL Editor. The authenticated app's template-list RPC now succeeds; save/default writes still need a business-owner acceptance test.

## Team authentication — invite flow repair

The previous cloud team form displayed an initial-password field, but `smartsell_command('/staff')` only inserted a row in `smartsell_invitations`; it neither created an `auth.users` account nor used the supplied password. That is why a newly added teammate could not sign in and received Supabase's generic "Invalid login credentials" error.

The updated UI removes the fake initial-password field and sends invitations through `supabase/functions/invite-team-member`. The function verifies the caller through Supabase Auth and `smartsell_identity`, requires the active owner role, calls the tenant-scoped `smartsell_team_invite` RPC, then sends a Supabase Auth invite email. The RPC validates role/branch and upserts pending invitations for retries. On invite acceptance, the existing `smartsell_identity` function provisions the member record after email confirmation.

The migration was applied in the authenticated SQL Editor and verified: `public.smartsell_team_invite(jsonb)` exists, authenticated callers can execute it, and `anon`/`PUBLIC` cannot. The `invite-team-member` Edge Function was deployed through the Dashboard editor. Its `ALLOWED_ORIGINS` secret allows `http://localhost:5173` and `http://127.0.0.1:5173`, and both corresponding `/login` URLs are in the Auth redirect allowlist. The function's CORS allow-header list includes `x-client-info`, and a live Edge Runtime OPTIONS request returned HTTP 200 with the expected CORS headers.

Team invitation initially failed because `private.handle_new_user()` still inserted into the intentionally removed `public.profiles` table. The focused migration `supabase/migrations/20261031132630_remove_orphaned_profile_auth_trigger.sql` drops only the obsolete `on_auth_user_created` trigger; it was applied in the hosted SQL Editor and a `pg_trigger` query confirmed that trigger is absent. The previously saved pending invitation was retried through the app after this fix, and the app reported “Invitation email sent.” Supabase's invitation call therefore returned success, but the recipient's mailbox delivery and invitation acceptance have not been independently confirmed. These hosted changes were applied directly in SQL Editor and have not been reconciled into `supabase_migrations.schema_migrations`; reconcile migration history before a future CLI migration push to avoid reapplying them.

## Hostinger Auth email delivery

The Supabase Edge secret `hostinger_email_api` is present in the hosted project. `supabase/functions/hostinger-auth-email` implements the Supabase Auth Send Email HTTP Hook: it verifies signed hook payloads, creates action links from Supabase's token hashes, and sends signup, invite, recovery, sign-in, and account-notification emails through Hostinger's Mail API. It resolves the mailbox automatically when the API token is scoped to exactly one mailbox; for a token with multiple mailboxes, set `HOSTINGER_MAILBOX_RESOURCE_ID`. The function is configured with `verify_jwt = false` because Auth Hook requests are authenticated with the Standard Webhooks signature, not a user JWT.

The `hostinger-auth-email` function is deployed with JWT verification disabled, and the Supabase Send Email Auth Hook is enabled at `https://qislzkmdfrkelihuklid.supabase.co/functions/v1/hostinger-auth-email`. The hook signing secret was rotated and synchronized with the Edge Function's `SEND_EMAIL_HOOK_SECRETS`; the hosted secrets dashboard's SHA-256 fingerprint matched the current hook secret without exposing its value. A direct unsigned POST was rejected with HTTP 401, and a GET returned the expected HTTP 405. The authorized team-invitation retry returned success from Supabase after removing the broken Auth trigger, but the dashboard did not expose invocation log data during verification, so Hostinger's API acceptance and recipient inbox delivery remain unconfirmed. Verify that `hostinger_email_api` can access exactly one Hostinger mailbox, or configure `HOSTINGER_MAILBOX_RESOURCE_ID`, then confirm delivery with the recipient. Hostinger Mail API saves outbound messages to the mailbox's Sent folder; incoming mail remains in Hostinger Webmail and is not shown in Smartsell. The signup client requests a redirect to the current app's `/login` page; the local `http://localhost:5173/login` and `http://127.0.0.1:5173/login` redirects are allowlisted.

Before production use, add the deployed app's exact origin to `ALLOWED_ORIGINS`, add its `/login` URL to the Supabase Auth redirect allowlist, independently verify Hostinger delivery, and run an owner-sent invite acceptance/sign-in test. No service-role/secret key is exposed in the browser. Teammate login has not yet been acceptance-tested. Invitations created by the old UI may be resent; the new RPC updates an existing pending invitation for the same business.

The supplied Swahivo POS logo is included in `public/brand/swahivo-pos-logo.png`, used in the app wordmark and on receipt documents. The provided sample receipt/invoice/warehouse images were treated as visual guidance only; none are used as document backgrounds or contain copied third-party watermarks/sample business information in the application.

This phase intentionally does not claim the complete requested document-management system. The other requested document schemas/workflows, persisted business branding separate from receipt templates, issued immutable document snapshots/reissue lifecycle, template version history, public receipt verification, real QR verification tokens, upload via Supabase Storage, generalized drag-and-drop components, and full multi-page PDF generation remain outstanding. Browser print/Save as PDF is available for receipts; it is not a server-generated PDF pipeline.

## Audit

Inspected all seven Markdown files in `Md/` and its asset inventory, plus the supplied dark dashboard reference. The workspace contained only `Md/`: no router, application, package manifest, auth service, backend configuration, migration history or Git repository. There was no existing functionality to extend and no live database authorized/configured for inspection. Instructions referring to an existing app or a separate Saino project were contextual statements in the source package, not evidence of files in this workspace.

The original implementation preserved the requested Vite/React/TypeScript/Tailwind direction and introduced a local Express/SQLite backend without connecting or modifying any external system. Public and authenticated layouts share a coherent navy/mint/violet system based on `DESIGN.md`. Public product illustrations are labeled illustrations, not business metrics. Empty charts carry no fabricated percentages or activity.

## Source map

- `src/App.tsx`: routing, session boundary, responsive workspace shell and branch context.
- `src/components/public.tsx`: landing, account signup and login.
- `src/components/pages.tsx`: dashboard, inventory, POS, reports, directories, branch/team lists, transaction log and settings.
- `src/components/actions.tsx`: validated workflows, CSV preview and printable receipts.
- `src/components/shared.tsx`, `src/components/ui/button.tsx`: accessible dialog/form/table primitives and Radix-based composable button.
- `src/lib/api.ts`: typed workspace transport, currency input parsing, business date conversion.
- `src/lib/supabase.ts`: browser-only Supabase client factory using URL and publishable-key environment variables.
- `src/styles.css`: dark/light semantic tokens, responsive desktop/tablet/mobile screens and receipt print layout.
- `server/db.mjs`: schema version 1, foreign keys, WAL and indexes.
- `server/app.mjs`: session authentication, tenant/role/branch validation, stock and financial transactions and private exports.
- `tests/workflows.test.mjs`: isolated API acceptance and negative tests.
- `server/db.mjs`: schema version 2 migration adds default-branch/business-category fields, variant stock in thousandths, and restaurant tables/orders/stations.

## Security and correctness

Prepared SQL parameters are used for user values. Dynamic table names come only from server constants or validated enums. All branch-scoped writes verify both business ownership and member scope. Role labels and tenant IDs from client bodies do not grant privileges. Passwords use scrypt with a random salt. Session tokens are random, stored as SHA-256 hashes, expire after seven days, and travel in HTTP-only SameSite Strict cookies. Mutations require JSON and enforce trusted browser origins. Authentication is rate limited in process. Production mode requires HTTPS Secure cookies. Disabling a member and changing a password revoke sessions.

Financial mutations use server transactions; currency inputs are parsed without floating-point multiplication. Tax and fractional line totals use BigInt rounding. Checkout keys are unique per business and bound to the full payload. Negative inventory fails before commit. Product creation/import, variant creation, purchase receipt, sale, refund, payment and stock adjustments append movement/audit events as applicable. Quantities are persisted as integer thousandths, supporting up to three decimal places. Currency changes are blocked after catalog/financial records exist to prevent reinterpretation of amounts. Inventory transfers immediately move stock at both ends in the same transaction; dispatch/receive staging is not implemented.

Cashiers cannot view costs, supplier data, expenses, team, audit logs or another cashier's sales in the API payload. Catalog/customer visibility remains business-wide; sale/stock scope is the assigned branch. Managers can edit business branch contact details but cannot use that permission to operate on an unassigned branch. Credit and discount/tax overrides are manager/owner operations. Refunds are whole-sale only. History is append-only at the API level, not tamper-proof against a database/server administrator.

Restaurant table orders remain separate from POS sales: creating an order does not change stock; sending it to the kitchen atomically deducts stock. Items are routed to selected stations and advance through queued, preparing, ready and served states. Closing a served order frees its table but does not record payment or accounting.

## Verified acceptance evidence

`npm test` exercises:

- Signup with a real empty tenant and default branch.
- Two businesses and denial of cross-tenant product editing, branch selection and export retrieval.
- Exact sale tax/discount/cash change, stock deduction and frozen cost snapshots.
- Duplicate checkout returning the same sale; mismatched key payload rejected.
- Insufficient-stock rollback with no partial sale or stock mutation.
- Order creation without stock increase, receiving once and rejecting repeated receiving.
- Supplier/customer partial payments and overpayment rejection.
- Expense recording and balanced branch transfers.
- Cashier denial of catalog/settings writes, cross-branch reads and refunds; sensitive data omitted.
- Staff session revocation when disabled.
- Full refund once, stock movements reconciling with on-hand quantities.
- Currency lock after records exist.
- Business-category "Other" validation, main-branch edits by managers, variant SKU/pricing/stock, fractional sales and variant purchase receiving.
- Owner-only team-member editing for name, manager/cashier role and assigned branch; permission changes revoke active sessions, with tests for owner protection and non-owner denial.
- Restaurant table setup, station routing, unsent-order stock preservation, kitchen status transitions and stock deduction on submission.
- CSV duplicate rollback and successful validated batch.
- Anonymous reads and untrusted-origin writes rejected.
- Simultaneous requests for the last unit permit one sale and reject the other; stale expected totals fail before any writes.
- Password updates revoke other sessions while preserving data and allowing a fresh login.

Browser QA used a separate in-memory server (`node tests/browser-preview.mjs`, port 3002) so the normal database was never populated with test records. Verified signup, empty dashboard, product creation, cash checkout (KES 120 total, KES 200 tendered, KES 80 change), receipt and stock decreasing from 10 to 9. Verified responsive inventory at a 390×844 viewport in dark and light themes; document content width matched viewport width. No warning/error console entries were observed in that flow. The temporary viewport was reset and the test server stopped after QA.

`npm run build` checks TypeScript and produces the compiled Vite application. These tests do not establish full production readiness, multi-process scalability, external fiscal compliance, Supabase connectivity or every original phase's definition of done. QR rendering is generated in the browser from the product/variant SKU; no external QR service is used. Online-wallet processing remains disabled until a provider is selected, verified and configured.

## Release limitations

Read `README.md` for the explicit list of remaining features. Original `Md/TASKS.md` checkboxes are intentionally preserved: the full original production release gates have not been satisfied. There is no platform admin backdoor or browser role toggle. No external subscription billing or gateway is pretended to work. Restaurant orders do not post sales or settle payments. Financial statements here cover recorded sales/expenses and fixed catalog costing, not a full accounting general ledger.

Workspace reads currently load the authorized branch's full catalog/sales and paginate tables in the browser. Transaction views cap at the latest 2,000 events; exports include all dates or the requested period. Large-catalog server pagination, export expiry, import jobs, data retention, concurrent multi-process load tests and complete operational monitoring remain production work.

## Recovery

No preexisting source/data was altered. Stop the server and restore a private consistent backup of the entire `data/` folder to roll back business data. Do not delete the data folder to reset a real business. Application changes can be removed independently of the original `Md/` package. Set up version control and regular backups before ongoing use; this task did not create a remote or publish anything.

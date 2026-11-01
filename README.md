# Smartsell

Branding uses the supplied Swahivo wordmark unchanged, with **Smartsell** as the project name, and the supplied S icon as the favicon. Original requirements remain in `Md/`. The existing database filename and session-cookie name retain their original internal identifiers so branding changes preserve saved records and sessions.

A retail workspace built from the requirements and visual references in [Md](Md/README.md). The browser application authenticates with Supabase and calls the namespaced Smartsell RPCs directly; it does not fall back to SQLite or demo data. The original documents and assets are preserved.

## Run

Requires Node.js 24 or later, npm, and a configured Supabase project.

Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. A legacy `VITE_SUPABASE_ANON_KEY` is accepted if the project still uses the older key format. Never put a service-role or secret key in a `VITE_` variable or browser build.

```powershell
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Choose **Get started**, create your business, and add your own products. Signup, sessions, workspace reads, and supported mutations use Supabase Auth and authenticated RPCs. There are no default credentials, demo tenants, fabricated transactions, or seeded production records. If Supabase is not configured, the application displays an explicit configuration error rather than switching to local data.

The development server binds to loopback. Stop with Ctrl+C.

```powershell
npm test
npm run build
npm start
```

Run `npm run build` before `npm start`; Vite Preview serves the static client on **http://localhost:4173**. `npm test` covers the isolated legacy SQLite API harness; it does not verify connectivity to the hosted Supabase project.

## GitHub and Vercel deployment

The repository includes a GitHub Actions workflow that runs tests and a production build on pushes and pull requests. `.env`, build output, local data and Vercel metadata are excluded from Git; `.env.example` contains placeholders only.

To deploy, push the project to a GitHub repository and import it into Vercel. Vercel uses `npm run build`, serves the `dist` directory, and `vercel.json` sends application routes to the React entry point. In Vercel project settings, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for Production and Preview, then redeploy.

The production build includes an installable PWA shell. Its service worker caches only the app document and same-origin static assets; it never caches Supabase requests, authentication/session responses, or business data. Offline access is limited to the shell and previously cached static resources.

Before using a deployment, apply and verify the required Supabase migrations and storage policies. After Vercel assigns the production domain, add its origin and `/login` URL to Supabase Auth's allowed redirect URLs, set the Auth Site URL to the production origin, and add the exact production origin to the `ALLOWED_ORIGINS` Edge Function secret before redeploying `invite-team-member`. Repeat for a custom domain after it is linked. Keep service-role, secret, and email-provider keys in server-side Supabase secrets only.

Restaurant tables and kitchen workflows require applying [the Restaurant workflow migration](supabase/migrations/20261101084932_smartsell_restaurant_workflow.sql). It creates tenant- and branch-scoped Restaurant records, enables fractional stock movement, and exposes the guarded Restaurant RPC. The branch-edit migration also removes an invalid hosted timestamp trigger.

Invoice templates require applying [the sales-invoice migration](supabase/migrations/20261031152151_sales_invoice_templates.sql) to the target Supabase project before using the invoice template selector or printing invoices. Receipt templates remain available independently.

## Implemented workflows

- Signup creates an owner, business, and initial branch in one transaction. Login uses salted scrypt password hashes and expiring HTTP-only sessions.
- Dark default and account-persisted light/dark preference, responsive sidebar, branch switcher, landing page and onboarding.
- Signup and business settings include a business-category dropdown; choosing **Other** requires a custom label. The first branch is marked as the main branch. Owners create branches; managers can edit the main branch and all other branch contact details while remaining assigned to their operational branch.
- Product creation/editing with optional photos, SKU/barcode search, generated downloadable product QR codes, categories, variant SKUs/barcodes/pricing/stock, and quantity precision to three decimal places.
- Decimal-safe stock adjustments, purchase orders/receiving and checkout; variants have separate stock by branch and can be purchased and sold independently.
- CSV import with preview, all-or-nothing validation and duplicate protection. Inventory, sales, expense and transaction CSV exports with private download history.
- POS search/barcode input, cart quantities, manager discounts/tax, cash tender/change, customer credit, immutable line/cost snapshots, receipts and printing.
- Customizable, business-private sales receipt and A4 invoice templates, with separate defaults and invoice printing from sales records.
- Idempotent checkout and transactional stock deduction. Full-sale refunds restore stock; cash refunds must be handed back separately.
- Customer/supplier directories. Purchase orders leave stock unchanged; receiving adds stock and establishes a payable. Cash partial payments allocate against a sale or purchase.
- Expenses, branch creation, direct staff account creation, assigned branch access, disabling staff and revoking sessions.
- Owners can edit team-member names, roles (manager/cashier) and assigned branches. Permission and branch changes revoke that member’s active sessions.
- Restaurant & bar tables, open table orders, per-item kitchen-station routing, kitchen preparation/ready/served workflow, and stock deduction when an order is sent to the kitchen.
- Dashboard derived from saved records; branch/date-scoped sales reports, cost of goods, gross profit, expenses and transaction history.
- Business/profile settings and secure password changes that revoke other sessions.

## Money and inventory

All stored money is an integer in the currency's minor unit (KES 123.45 = 12345; UGX 123 = 123). The UI uses the configured currency scale. Tax uses basis points and BigInt rounding, half-up. Reports exclude refunded sales; net sales exclude tax and include discounts. Cost of goods uses the product/variant cost frozen at sale time. Quantities are stored as integer thousandths, support up to three decimal places, and line totals round half-up to the nearest minor currency unit. Stock valuation uses current catalog costs, not FIFO/weighted-average costing. Purchase unit costs are retained on purchase orders; receiving does not change catalog costs automatically.

Customer credit and supplier liabilities derive from document totals less allocated payments, rather than editable balances. A completed sale means a cash transaction or an approved credit receivable was recorded; it does not assert external payment settlement. Restaurant orders deduct inventory when sent to the kitchen, but are not sales documents: record payment and accounting separately in POS.

## Data and configuration

The browser app stores production records in the configured Supabase project, using `public.smartsell_*` objects and authenticated `smartsell_*` RPCs. It does not read the separate Saino schema. At the user's direction, the 14 Saino tables were removed from the hosted project after backup confirmation; see [implementation notes](docs/IMPLEMENTATION.md). Direct table access is not the application transport. Supabase Auth confirmation behavior is controlled by the project's Auth settings.

The `server/` Express/SQLite implementation remains only as a legacy workflow test harness and optional local-only server (`npm run start:legacy-local`). It is not the browser app's persistence layer. Tests use an isolated in-memory database and do not touch hosted Supabase.

Do not run the legacy server as the production data service. For disaster recovery, configure and test Supabase backups and point-in-time recovery in the project's own settings.

Authorization for the currently supported cloud operations is enforced in guarded database RPCs; the browser's selected branch is only a selector, never an authorization grant. Do not grant the browser direct table access or use a service-role key. The hosted project has the additive receipt-template migration applied, but its schema still predates several newer application workflows (including variants/fractional stock, restaurant operations, custom business categories, and branch/team editing). Those workflows must not be considered production-ready on Supabase until their migrations are applied and verified against the hosted project.

Team access uses Supabase Auth email invitations, not passwords created by the business owner. The `invite-team-member` Edge Function and `smartsell_team_invite` RPC migration have been deployed/applied to the hosted project. The function checks the caller's active Smartsell owner role and saves or updates the tenant-scoped invitation. Signup confirmations and team invitations route through the enabled Supabase Send Email Auth Hook at `supabase/functions/hostinger-auth-email`, using the existing `hostinger_email_api` Edge secret and Hostinger Mail API. The hook signing secret is stored server-side in `SEND_EMAIL_HOOK_SECRETS`, and the function is configured with JWT verification disabled. An obsolete Auth trigger that inserted into the removed `public.profiles` table was dropped; see [implementation notes](docs/IMPLEMENTATION.md). The local `ALLOWED_ORIGINS` and Auth redirect allowlists include both `http://localhost:5173` and `http://127.0.0.1:5173` (with `/login` for redirects); add the production app origin and its `/login` URL before production deployment. The function requires the Hostinger token to access exactly one mailbox, or `HOSTINGER_MAILBOX_RESOURCE_ID` must be configured. Never put a Supabase or Hostinger secret in the browser. The prior team form collected an initial password but did not create an Auth user or use that password; those invitations must be resent with this flow. Incoming messages remain in Hostinger Webmail; Smartsell does not provide an inbox UI. One previously authorized test invitation returned a successful response after the trigger fix; the recipient's inbox delivery and invitation acceptance have not been independently confirmed.

The first receipt-template editor is available at **Settings → Document templates**. It includes eight editable receipt styles, business-specific logo upload, color/font/paper/header/footer controls, undo/redo, save, default selection, and print-to-PDF. Its isolated table and guarded RPC are defined in `supabase/migrations/20261031100642_smartsell_document_templates.sql`; this additive migration was applied and the authenticated template-list RPC verified against the hosted project. Save/default writes still need a business-owner acceptance test. The template migration itself is additive and does not drop unrelated tables. The initial editor covers sales receipts only; invoice, quotation, purchasing, delivery, warehouse, and inventory documents, issued snapshots, QR verification, and a generalized drag/drop editor are not yet implemented.

Product photos use the `smartsell-product-images` Supabase Storage bucket and `smartsell_product_images` registry RPC. The bucket and four scoped storage policies are present in the hosted project; its product-ID unique index was verified and the idempotent index-repair migration is included for other environments. Photo uploads still require an authenticated owner or manager and a matching product record.

## Scope and next steps

This is a Supabase-connected client, **not yet a fully production-verified release**. The client cutover is implemented, but the currently deployed cloud schema has not been authenticated end-to-end from this workspace, and several newer workflows need a compatible migration before they can be used there. See [implementation notes](docs/IMPLEMENTATION.md) for acceptance evidence and remaining phases.

Online/mobile-money wallets remain unavailable because no provider has been selected, verified or configured; the interface does not simulate external payment results. Subscription/entitlements, fiscalization, password recovery email, platform operator administration, offline/PWA selling, returns to suppliers, staged transfers, stocktake sessions, recurring expenses, approval workflows, document PDF exports, receipt-template logo upload, contact archive, branch archive, notification services and account deletion requests remain unimplemented. Restaurant kitchen orders do not create POS sales or settle payments automatically. There are no subscription trials or paid plans to activate in this edition.

Before internet-facing deployment: choose and configure hosting and HTTPS, implement and verify operational backups and disaster recovery, persistent/distributed auth throttling, account recovery and audit retention, subscription and jurisdiction-specific compliance, and load/concurrency acceptance gates. SQLite and Node's synchronous database API are appropriate for this local edition; production scaling requires separate validation.

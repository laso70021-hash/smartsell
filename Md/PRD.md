# DukaPro — Unified Product Requirements Document
> **Project:** DukaPro — multi-tenant retail operations SaaS. **Status:** Proposed specification derived from supplied UI references; not an audit of deployed code, database, integrations, or business claims.
> **Existing project rule:** Inspect and extend the current application. Preserve Vite + React + TypeScript + Tailwind CSS + shadcn/ui. Use the connected backend already configured in the repository; Supabase is the target only where it is actually the existing backend. Never silently migrate frameworks, databases, or auth.
> **Visual authority:** Supplied dark DukaPro screenshots for current dashboard screens; the ten-panel composite for landing, platform admin, owner, cashier POS, inventory, sales, customers, suppliers, expenses and settings. Where references differ, retain established working flows and unify tokens without deleting features.

## 1. Vision
Provide one cohesive retail management SaaS that allows merchants to sell through POS, control products and stock across branches, manage staff, suppliers, customers, receivables and expenses, generate reports, and administer subscriptions. Platform operators manage the SaaS separately from merchant users. Reference screens are design inputs, not evidence that the features are implemented.

## 2. Users and permissions
| Persona | Primary tasks | Scope |
|---|---|---|
| Visitor | Learn, compare genuine plans, register, sign in | Public only |
| Platform admin | Manage tenants, subscriptions, support, compliance, system configuration | Audited privileged scope |
| Owner | Manage business settings, branches, users, catalog, finance | Owned business |
| Manager | Manage assigned branch operations, reports, staff if granted | Assigned branches |
| Supervisor | Review stock, approve allowed actions, supervise cashiers | Explicit permissions |
| Cashier | Sell, issue receipts, access own shifts and permitted returns | Assigned POS/branch |
| Other staff | Task-specific inventory, purchasing, sales, reports | Explicit capabilities |

## 3. Public and onboarding
Landing: responsive header, hero, product illustrations, features, genuine plans, FAQs, contact and footer. Authentication uses existing backend. Signup creates a real business, selects country/currency/timezone, establishes a default branch transactionally, assigns owner membership, then guides the owner to add products and invite employees. Empty business shows onboarding checklist, not fictional analytics.

## 4. Business workspace modules and acceptance criteria
### 4.1 Dashboard
Cards: Total Stock Value, Total Sales Value, Potential Profit, Today's Sales, Low Stock Items, Total Products. Charts: Stock Level Distribution, Stock by Unit, Sales Overview, Stock Status, Recent Sales. Date and branch scope are explicit. Clicking a card drills into matching records. Empty charts show no-data states.
### 4.2 Cashier POS
Barcode/name/SKU search, categories, cart, tax/discount, customer association, multiple authorized payment methods, cash change, receipt, print/share where integrated, void/return controls. Payment and stock commit exactly once; permissions and branch scope enforced.
### 4.3 Inventory
Product CRUD, categories, variants, units, barcodes, cost and sell price, threshold, branch stock, CSV import/export with validation and preview, top-up/adjustment, movement history, transfers, stock counts, stock alerts. Show SKU, cost, stock and sell price with sortable columns.
### 4.4 Reports
Sales, profit/margin, inventory, purchasing, customer, supplier, expense, cash/shift, tax and branch comparisons where backed by records. Period, branch and category filters; accurate export and drilldowns; charts must reconcile with transaction tables.
### 4.5 Staff
Invite/add staff, roles, permissions, branch assignment, activation/deactivation, session revocation where supported, audit. Owners can operate alone without forced fake employee accounts.
### 4.6 Stock Alerts
Configurable per-product threshold, low/out-of-stock views, search, branch selector, purchase/top-up action, history, print/share and CSV export. Explain whether exports include all branch products or only filtered results.
### 4.7 Branches
Create/edit/archive branches, contacts, location, active status, staff assignment, branch stock, transfers, branch reports. Never lose historical branch linkage.
### 4.8 Purchases and suppliers
Supplier directory, purchase orders, goods receipts, purchase returns, bills, supplier credit/payables, partial payments, statement/aging and transaction log. Purchase confirmation is not inventory receipt.
### 4.9 Customers and receivables
Customer directory, balances, credit limits, credit sales, partial payment allocation, statements, aging, reminders, transaction history. Only expose data to authorized staff.
### 4.10 Transactions
Four tabs All, Suppliers, Customers, Products. Filter by period/branch and relevant entity. Columns: Date/Time, Category, Entity Name, Activity/Description, Reference #, Amount/Quantity Impact, Branch. Events generated from real sales, bills, payments, adjustments, transfers and wallets when enabled.
### 4.11 Downloads
CSV/PDF/report/receipt export history with generated-at, scope, status, expiry and authorized access. No false 'download complete' states.
### 4.12 Profile
Full name, username if supported, email, phone, appearance (dark default/light alternative), password update through secure auth, deletion request workflow.
### 4.13 Business settings
Name, email, phone, address, registration/tax ID, country, city, currency/position, brand color/logo, operating mode, capabilities, staff role permissions, credit and wallet settings, trial-data cleanup with safeguards. Settings persist and affect forms, receipts, reports and permissions.

## 5. Optional industry capabilities
- Retail products (default).
- Product variants (size, color, barcode/SKU, separate stock).
- Service catalog where applicable.
- Restaurant/bar mode: tables, waiters, kitchen routing, orders and shifts only if supported and enabled.
- Supplier credit and customer credit.
- Wallet/payment accounts with verified reconciliation.
- Variable price override with permission and audit.
- Divisible units for weight/length/volume with decimal-safe quantities.
Capability switches must not expose unimplemented modules; disabled options explain prerequisites.

## 6. Platform administration
Dedicated console: Dashboard; Users; Businesses; Branches; Products; Categories; Sales; Purchases; Inventory; Customers; Suppliers; Expenses; Reports; Subscriptions; Support; Audit Logs; Settings. Search and filters, tenant detail, verified plan/usage data, subscription status and support workflows. All privileged changes audited. Admin dashboards must not reveal sensitive data beyond role authorization.

## 7. Subscription and billing
Trial start/end, plans, entitlements, upgrade, renewal, payment attempts, verified manual payment if applicable, receipts, expiry and grace periods. Promotions are real persisted records with validated eligibility and expiry; no fabricated countdown. The business remains able to access/export legally required records according to retention policy after expiry.

## 8. Business rules
- Financial reports use exact decimals, documented tax and refund treatment, business currency and timezone.
- Inventory stock is derived from controlled movements; sales, receipts, returns, transfers and adjustments reconcile.
- Cross-business data is never visible; branch scope applies to all relevant reports and actions.
- All customer/supplier credit balances are ledger-derived.
- User theme is preference only, not a security setting.
- Receipts and invoices use business branding and correct branch/tax data; fiscal compliance needs verified integration.

## 9. Quality attributes
Responsive desktop/tablet/mobile; accessible controls; fast cashier search; resilient retries; secure tenant isolation; auditability; real empty/loading/error states; controlled migrations; secure file handling; observability; meaningful test coverage; installable PWA only when actual manifest/service worker requirements are met.

## 10. Release acceptance
Demonstrate two separate tenants and two branches; role-denied writes; complete sale→stock movement→receipt→dashboard reconciliation; purchase→goods receipt→supplier payable; customer credit→partial payment; report export; user theme persistence; subscription entitlement enforcement; no mock data; mobile flows; failure/retry and concurrency behavior.

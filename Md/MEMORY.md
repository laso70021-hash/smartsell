# DukaPro — Project Memory & Decision Register
> **Project:** DukaPro — multi-tenant retail operations SaaS. **Status:** Proposed specification derived from supplied UI references; not an audit of deployed code, database, integrations, or business claims.
> **Existing project rule:** Inspect and extend the current application. Preserve Vite + React + TypeScript + Tailwind CSS + shadcn/ui. Use the connected backend already configured in the repository; Supabase is the target only where it is actually the existing backend. Never silently migrate frameworks, databases, or auth.
> **Visual authority:** Supplied dark DukaPro screenshots for current dashboard screens; the ten-panel composite for landing, platform admin, owner, cashier POS, inventory, sales, customers, suppliers, expenses and settings. Where references differ, retain established working flows and unify tokens without deleting features.

## Product identity
DukaPro is a cloud-based retail/POS/inventory/business operations SaaS. It serves independent retailers and multi-branch businesses, with separate platform admin, owner, manager, supervisor, cashier and permitted staff experiences. Business records are isolated per tenant; branches belong to a business. A business can optionally enable specialized modules (variants, supplier/customer credit, wallets, variable pricing, divisible goods, restaurant/bar workflows) without changing the core navigation.

## Decisions captured from the images
- Dark mode is default: near-black app canvas, deep navy sidebar, slate surfaces, mint/emerald selected navigation, purple primary buttons. Light mode is an alternate user preference.
- Use two layers of navigation: platform admin console and tenant business workspace; cashier mode is a purpose-built POS surface, not a platform-admin role.
- Main business sidebar: Dashboard, Inventory, Reports, Staff, Stock Alerts, Branches, Purchases, Receivables, Transactions (Suppliers, Customers, Products, All), Downloads, Profile, Settings. Expandable items keep their nested active state.
- Main header: business/brand identity, subscription status and real deadline, applicable promotion, Cashier Mode, notifications, appearance switch, settings, user role menu.
- Screenshots show UGX and Tanzania examples in different views. Currency must come from each business's saved settings; never globally hardcode UGX/TZS. Country, city, taxes and locale are business-scoped.
- Empty states are real first-run states; no fake transactions, sales, staff, products, user counts, uptime or 'trusted by 5000+' claims unless independently measured and approved.
- POS and stock movements are linked: finalized sales decrement branch stock exactly once; returns reverse appropriately; adjustments and transfers are audited.
- Default branch exists only after real business onboarding or verified migration; do not fabricate branches in query results.
- Staff must belong to an actual tenant, have a branch assignment where required, and have server-enforced permission scopes.
- Trial, offer countdown and subscriptions are backend-controlled, not client-trusted timers; offers must not be invented.

## Screenshot-to-module index
| Screenshot | Module | Primary requirements |
|---|---|---|
| Dark dashboard | Owner dashboard | Onboarding, stock/sales/profit KPIs, stock distribution, sales chart, recent sales |
| Dark inventory | Inventory | Search, branch filter, SKU, cost, price, stock, CSV import/export, stock top-up, history |
| Dark stock alerts | Stock alerts | Threshold filtering, low/out-of-stock, actions, exports |
| Dark staff | Staff | Members, role, branch, email, invite/add, manage |
| Dark branches | Branches | Default branch, contact, staff count, status, add/edit |
| Dark transaction tabs | Transaction log | Supplier, customer, product, all activity; period and branch filters |
| Dark profile | User profile | Personal info, theme choice, secure password change, deletion request |
| Dark business settings | Business profile | Business info, currency, operating mode, capability toggles, permissions, trial cleanup |
| Composite 01–10 | Complete product | Landing, platform admin, owner, POS, inventory, reports, customers, suppliers, expenses, settings |

## Open validation questions
- What backend, database schema, payment processor, email service and subscription service are actually installed?
- What are the current URLs and role names? Which routes and features already work?
- Which jurisdictions and fiscalization integrations are legally required? Tax invoices are not automatically government-compliant.
- Is the restaurant mode part of the existing deployed product or a future entitlement?
- Is offline POS required? Do not advertise offline-safe selling until conflict/reconciliation behavior is implemented and tested.

## Decision change log
Maintain a dated entry for every architecture, UI, schema, financial or role-permission change. Record evidence, migration impact, rollback and approver.

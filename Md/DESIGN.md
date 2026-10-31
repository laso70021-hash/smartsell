# DukaPro — Design System & Screen Contracts
> **Project:** DukaPro — multi-tenant retail operations SaaS. **Status:** Proposed specification derived from supplied UI references; not an audit of deployed code, database, integrations, or business claims.
> **Existing project rule:** Inspect and extend the current application. Preserve Vite + React + TypeScript + Tailwind CSS + shadcn/ui. Use the connected backend already configured in the repository; Supabase is the target only where it is actually the existing backend. Never silently migrate frameworks, databases, or auth.
> **Visual authority:** Supplied dark DukaPro screenshots for current dashboard screens; the ten-panel composite for landing, platform admin, owner, cashier POS, inventory, sales, customers, suppliers, expenses and settings. Where references differ, retain established working flows and unify tokens without deleting features.

## Visual source and color extraction
The following base colors were sampled from the supplied dark UI screenshot; accent colors are representative visual matches from the collection and should be checked against final brand assets before release.

| Token | Dark default | Light alternative | Usage |
|---|---|---|---|
| App canvas | `#020617` | `#F8FAFC` | Page background |
| Sidebar | `#0A192F` | `#FFFFFF` | Primary navigation |
| Header | `#0E1629` | `#FFFFFF` | Top app bar |
| Card/surface | `#1E293B` | `#FFFFFF` | Panels, tables, forms |
| Surface elevated | `#263449` | `#F1F5F9` | Hover/selected rows |
| Border | `#3C495D` | `#E2E8F0` | Dividers |
| Primary text | `#F8FAFC` | `#0F172A` | Headings/body |
| Secondary text | `#93B4D3` | `#64748B` | Descriptions |
| Active nav / success | `#10B981` | `#059669` | Selection, success, cashier CTA |
| Primary CTA | `#4F46E5` | `#2563EB` | Create/save/action |
| Accent blue | `#2563EB` | `#2563EB` | Links, charts |
| Warning | `#F59E0B` | `#D97706` | Low stock, trial |
| Danger | `#EF4444` | `#DC2626` | Out of stock, destructive |
| Promotional gradient | `#EC4899 → #F97316` | same | Time-limited offers only |

### Token implementation
Use semantic CSS custom properties and shadcn theme variables. Set `data-theme=dark` or `.dark` at app root on first visit; persist explicit preference per user, falling back to local storage only for non-sensitive theme selection. No hardcoded white components inside dark layouts.

```css
:root { --background: 210 40% 98%; --foreground: 222 47% 11%; --card: 0 0% 100%; --primary: 221 83% 53%; --border: 214 32% 91%; }
.dark { --background: 229 84% 5%; --foreground: 210 40% 98%; --card: 215 28% 17%; --primary: 243 75% 59%; --border: 215 22% 30%; }
```

## Layout and navigation
- Desktop: 232–250px fixed or sticky navy sidebar, scrollable main content, full-width top subscription bar only when relevant, second toolbar for actions/account, 24–32px content padding.
- Tablet: collapsible sidebar; keep contextual branch filters and action toolbar accessible.
- Mobile: drawer navigation, compact header, horizontally scrollable data tables or accessible card list; never crop actions.
- Typography: clean sans-serif (Inter or existing font), 14–16px body, 20–28px page headings, 12px metadata. Spacing: 4/8/12/16/24/32 scale. Radius: 10–14px cards, 8px controls.
- Active nav: mint text/icon and dark teal background with thin emerald left edge; active subitem is slightly lighter slate with mint label.
- Button semantics: primary violet/blue; cashier mode green; neutral slate; destructive red. Disabled buttons explain missing permission/entitlement.

## Page-by-page contracts
### Public landing
Light marketing reference is allowed independently of the authenticated dark default. Header Home/Features/Pricing/About/Contact/Sign in/Get started; hero 'Smart Retail Management for Growing Businesses'; POS, inventory, customer, supplier, reports and multi-branch feature cards; product previews; genuine pricing and FAQs; clear login/onboarding CTA. Never publish unverified 10K+, 99.9% or 24/7 claims.
### Platform admin
Separate admin shell with Users, Businesses, Branches, Products, Categories, Sales, Purchases, Inventory, Customers, Suppliers, Expenses, Reports, Subscriptions, Settings and audit/operations. KPI cards, growth chart, plan distribution, recent registrations/activity. All counts must come from authorized server aggregation.
### Owner dashboard
Onboarding panel until products/staff are configured; stock value, sales, potential profit, today's sales, low-stock count, total products. Stock distribution, units, 7-day sales chart, recent sales. Zero states must be meaningful, not fake activity.
### Cashier POS
Fast product lookup/barcode, categories, product tiles, cart, quantity, discounts, tax, customer, payment methods, suspend/resume sale, checkout, receipt/print. Explicit stock and price validation; offline behavior only if implemented.
### Inventory
Search by product/SKU/notes, branch selector, add product, print/share, CSV import/export, top-up, history, sortable columns (product, SKU, cost, stock, sell). Variants, units, alert thresholds and lot/expiry fields are capability-driven.
### Sales and reports
Period/branch filters, KPI cards, sales trend, category breakdown, products/customers/payment methods, drilldown, download. Dates and timezone use business configuration.
### Customers / suppliers
Searchable records, contact info, balances, purchase/supply history, credit limits, payments, add/edit/archive, ledger and statements. Permission-gated exports.
### Expenses / purchases
Category filters, recurring expenses, supplier purchase orders, receiving, bills, partial payments and returns. No stock changes until authorized receipt/adjustment.
### Staff / branches
Sortable tables, add/invite/edit, role and branch assignment, disable/revoke, branch status/contact, branch-scoped counts and reports.
### Stock alerts
Low/out-of-stock list, threshold, branch filter, actions for top-up/PO, alert history and accurate CSV scope.
### Transaction log
All/Suppliers/Customers/Products tabs; period filter with Apply; columns date/time, category, entity, description, reference, amount/quantity impact, branch. Immutable, server-derived events with drilldown.
### Profile / settings
Profile fields, theme selection (dark first), password change, deletion request; business profile details, tax registration, country/city, currency symbol/position, brand color, operating mode and gated capabilities. Settings saves must be validated and audited.

## Interaction standards
Tables: skeleton loading, explicit zero states, filter chips, sorting, pagination, total count, row action menu, responsive rendering. Forms: inline validation, optimistic UI only for safe operations, confirmation for irreversible actions. Charts: real data only; no percentages when denominator is zero. Use actual currency/locale formatting and color-independent statuses.

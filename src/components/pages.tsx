import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Package,
  ShoppingBag,
  TrendingUp,
  TriangleAlert,
  Plus,
  Download,
  ArrowDownLeft,
  Search,
  SlidersHorizontal,
  ReceiptText,
  Users,
  Store,
  Check,
  Clock3,
  MoreHorizontal,
  ShoppingCart,
  Minus,
  ShieldCheck,
  Wallet,
  CalendarDays,
  FileText,
  QrCode,
  Utensils,
  Play,
  Square,
} from "lucide-react";
import { useWorkspace } from "../App";
import {
  api,
  businessCategories,
  currencyOptions,
  countryOptions,
  dateKey,
  multiplyMinor,
  toMinor,
  type Row,
} from "../lib/api";
import {
  Badge,
  DataTable,
  Empty,
  PageTitle,
  Fields,
  Form,
  Modal,
  ProductPhoto,
  type Column,
} from "./shared";
import { Button } from "./ui/button";
export function ExportButton({
  kind,
  low = false,
  from,
  to,
}: {
  kind: string;
  low?: boolean;
  from?: string;
  to?: string;
}) {
  const { branch, data, refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const candidates =
            kind === "inventory"
              ? data.products.filter((p) => !low || p.stock <= p.threshold)
              : kind === "sales"
                ? data.sales
                : kind === "expenses"
                  ? data.expenses
                  : data.events;
          const rows = candidates.filter((row) => {
            if (kind === "inventory") return true;
            const date = row.date || dateKey(row.created_at, data.business.timezone);
            return (!from || date >= from) && (!to || date <= to);
          });
          const escape = (value: unknown) =>
            `"${String(value ?? "")
              .replace(/^[=+\-@\t\r]/, "'$&")
              .replaceAll('"', '""')}"`;
          const columns = rows.length
            ? Object.keys(rows[0])
            : ["No records in selected scope"];
          const content =
            "\uFEFF" +
            [
              columns.map(escape).join(","),
              ...rows.map((row) =>
                columns.map((column) => escape(row[column])).join(","),
              ),
            ].join("\r\n");
          const name = `smartsell-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
          await api("/exports", {
            branch_id: branch,
            name,
            scope: `${kind}${low ? " · low stock only" : ""} · ${from || "all dates"} to ${to || "present"} · monetary columns in minor units`,
            content,
          });
          const a = document.createElement("a");
          const url = URL.createObjectURL(
            new Blob([content], { type: "text/csv;charset=utf-8" }),
          );
          a.href = url;
          a.download = name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 0);
          await refresh();
          notify("CSV generated. Monetary columns use minor currency units.");
        } catch (e) {
          notify((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download size={16} />
      {busy ? "Generating…" : "Export"}
    </Button>
  );
}
function Stat({
  label,
  value,
  description,
  icon: Icon,
  tone = "mint",
  to,
}: {
  label: string;
  value: string;
  description: string;
  icon: typeof Package;
  tone?: string;
  to: string;
}) {
  return (
    <Link className="stat-card" to={to}>
      <div className="stat-top">
        <span>{label}</span>
        <span className={"stat-icon " + tone}>
          <Icon size={18} />
        </span>
      </div>
      <strong>{value}</strong>
      <div className="stat-bottom">
        <small>{description}</small>
        <ArrowUpRight size={15} />
      </div>
    </Link>
  );
}
export function Dashboard() {
  const { data, money, act, canManage } = useWorkspace();
  const { products, sales, business } = data;
  const completed = sales.filter((s) => s.status === "completed");
  const today = dateKey(new Date().toISOString(), business.timezone);
  const low = products.filter((p) => p.stock > 0 && p.stock <= p.threshold),
    out = products.filter((p) => p.stock === 0),
    healthy = products.filter((p) => p.stock > p.threshold);
  const name = data.user.name.split(" ")[0];
  return (
    <>
      <PageTitle
        eyebrow="YOUR BUSINESS AT A GLANCE"
        title={`Welcome back, ${name} 👋`}
        description="A little clarity for the day ahead. Here’s where things stand."
        actions={
          <>
            <span className="date-label">
              <CalendarDays size={15} />
              {new Intl.DateTimeFormat("en", {
                dateStyle: "medium",
                timeZone: business.timezone,
              }).format(new Date())}
            </span>
            {canManage && (
              <Button onClick={() => act("product")}>
                <Plus size={17} />
                Add product
              </Button>
            )}
          </>
        }
      />
      {!products.length ? (
        <div className="onboarding">
          <div className="onboarding-copy">
            <span className="eyebrow">LET’S MAKE IT YOURS</span>
            <h2>
              Great things start
              <br />
              with your first product.
            </h2>
            <p>
              Your workspace is ready. Add your inventory and turn
              <br className="desktop-only" /> your first sale into the start of
              something bigger.
            </p>
            <div className="row">
              {canManage ? (
                <Button onClick={() => act("product")}>
                  Add your first product <ArrowRight size={17} />
                </Button>
              ) : (
                <Button asChild>
                  <Link to="/app/pos">
                    Open point of sale <ArrowRight size={17} />
                  </Link>
                </Button>
              )}
              <Link
                className="text-link"
                to={
                  data.user.role === "owner" ? "/app/settings" : "/app/profile"
                }
              >
                Review your setup <ArrowUpRight size={15} />
              </Link>
            </div>
          </div>
          <div className="onboarding-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="art-box">
              <Package size={69} strokeWidth={1} />
              <span className="art-check">
                <Check size={17} />
              </span>
            </div>
            <span className="art-tag">
              <span className="live-dot" /> Ready for business
            </span>
            <span className="spark spark-one">+</span>
            <span className="spark spark-two">+</span>
          </div>
        </div>
      ) : (
        <div className="welcome-strip">
          <span className="live-dot" /> All systems connected. Your dashboard
          reflects saved records for the selected branch.
          <Link to="/app/pos">
            Make a sale <ArrowRight size={14} />
          </Link>
        </div>
      )}
      <div className="section-label">
        <h2>Business overview</h2>
        <Badge>
          {canManage
            ? "Current branch · live records"
            : "Your sales · assigned branch"}
        </Badge>
      </div>
      <div className="stats-grid">
        {canManage && (
          <Stat
            label="Total stock value"
            value={money(
              products.reduce(
                (s, p) =>
                  s +
                  multiplyMinor(p.cost, p.stock) +
                  (p.variants || []).reduce(
                    (n: number, v: Row) => n + multiplyMinor(v.cost, v.stock),
                    0,
                  ),
                0,
              ),
            )}
            description="At cost · current inventory"
            icon={Package}
            to="/app/inventory"
          />
        )}
        <Stat
          label="Total sales"
          value={money(completed.reduce((s, r) => s + r.total, 0))}
          description="Completed sales · all time"
          icon={ShoppingBag}
          tone="violet"
          to="/app/sales"
        />
        {canManage && (
          <Stat
            label="Potential profit"
            value={money(
              products.reduce(
                (s, p) =>
                  s +
                  multiplyMinor(p.price - p.cost, p.stock) +
                  (p.variants || []).reduce(
                    (n: number, v: Row) =>
                      n + multiplyMinor(v.price - v.cost, v.stock),
                    0,
                  ),
                0,
              ),
            )}
            description="Unrealized margin on stock"
            icon={TrendingUp}
            tone="blue"
            to="/app/reports"
          />
        )}
        <Stat
          label="Today’s sales"
          value={money(
            completed
              .filter((s) => dateKey(s.created_at, business.timezone) === today)
              .reduce((s, r) => s + r.total, 0),
          )}
          description={`Today · ${business.timezone}`}
          icon={ReceiptText}
          tone="blue"
          to="/app/sales"
        />
        {canManage && (
          <>
            <Stat
              label="Low stock items"
              value={String(low.length + out.length)}
              description="At or below reorder level"
              icon={TriangleAlert}
              tone="amber"
              to="/app/stock-alerts"
            />
            <Stat
              label="Total products"
              value={String(products.length)}
              description="Active products in your catalog"
              icon={Package}
              tone="violet"
              to="/app/inventory"
            />
          </>
        )}
      </div>
      <div className="dashboard-charts">
        <section className="panel sales-chart-panel">
          <div className="panel-heading">
            <div>
              <h3>Sales overview</h3>
              <p>Your daily performance over the last 7 days</p>
            </div>
            <Badge>
              <span className="live-dot" /> Sales
            </Badge>
          </div>
          <SalesChart />
        </section>
        <section className="panel stock-panel">
          <div className="panel-heading">
            <div>
              <h3>Inventory health</h3>
              <p>A clearer view of your stock</p>
            </div>
            <Package size={18} />
          </div>
          <div className="donut-wrap">
            <div
              className="donut"
              style={
                products.length
                  ? {
                      background: `conic-gradient(var(--mint) 0 ${(healthy.length / products.length) * 100}%,#f2b65a ${(healthy.length / products.length) * 100}% ${((healthy.length + low.length) / products.length) * 100}%,#fb7185 ${((healthy.length + low.length) / products.length) * 100}% 100%)`,
                    }
                  : undefined
              }
            >
              <div>
                <strong>{products.length}</strong>
                <span>total products</span>
              </div>
            </div>
          </div>
          <div className="stock-legend">
            {[
              ["Healthy stock", healthy.length, "mint"],
              ["Low stock", low.length, "amber"],
              ["Out of stock", out.length, "red"],
            ].map(([s, n, c]) => (
              <div key={s}>
                <span>
                  <i className={"dot " + c} />
                  {s}
                </span>
                <strong>{n}</strong>
              </div>
            ))}
          </div>
          {!products.length && (
            <small className="chart-note">
              Add products to see your stock distribution.
            </small>
          )}
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Recent sales</h3>
              <p>The latest from your checkout</p>
            </div>
            <Link to="/app/sales" className="text-link">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {sales.length ? (
            <div className="recent-list">
              {sales.slice(0, 4).map((s) => (
                <button
                  className="recent-row"
                  onClick={() => act("receipt", s)}
                  key={s.id}
                >
                  <span className="square-icon">
                    <ReceiptText size={17} />
                  </span>
                  <span>
                    <strong>{s.reference}</strong>
                    <small>
                      {s.customer} ·{" "}
                      {new Date(s.created_at).toLocaleDateString()}
                    </small>
                  </span>
                  <strong>{money(s.total)}</strong>
                  <Badge tone={s.status === "refunded" ? "red" : "mint"}>
                    {s.status}
                  </Badge>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="Your first sale starts here"
              description="Completed checkouts will appear in this space."
              action={
                <Link className="text-link" to="/app/pos">
                  Open point of sale <ArrowUpRight size={14} />
                </Link>
              }
            />
          )}
        </section>
        <section className="panel quick-actions">
          <div className="panel-heading">
            <div>
              <h3>Make your next move</h3>
              <p>Your everyday shortcuts</p>
            </div>
          </div>
          {[
            {
              icon: ShoppingCart,
              title: "Make a sale",
              desc: "Go straight to checkout",
              to: "/app/pos",
            },
            {
              icon: Package,
              title: "Manage inventory",
              desc: "Keep your shelves ready",
              to: "/app/inventory",
            },
            {
              icon: Users,
              title: "Your customers",
              desc: "Build better relationships",
              to: "/app/customers",
            },
          ]
            .filter((_, i) => canManage || i === 0)
            .map((a) => (
              <Link key={a.title} to={a.to}>
                <span className="square-icon">
                  <a.icon size={18} />
                </span>
                <div>
                  <strong>{a.title}</strong>
                  <small>{a.desc}</small>
                </div>
                <ArrowUpRight size={17} />
              </Link>
            ))}
        </section>
      </div>
    </>
  );
}
export function SalesChart({ from, to }: { from?: string; to?: string }) {
  const { data, money } = useWorkspace();
  const today = dateKey(new Date().toISOString(), data.business.timezone);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 6 + i);
    return d.toISOString().slice(0, 10);
  });
  const values = days.map((d) =>
    data.sales
      .filter(
        (s) =>
          s.status === "completed" &&
          dateKey(s.created_at, data.business.timezone) === d &&
          (!from || d >= from) &&
          (!to || d <= to),
      )
      .reduce((n, s) => n + s.total, 0),
  );
  const max = Math.max(...values, 1);
  const sum = values.reduce((a, b) => a + b, 0);
  return (
    <div className="sales-chart">
      <div className="chart-total">
        <strong>{money(sum)}</strong>
        <span>last 7 days{from || to ? " · filtered" : ""}</span>
      </div>
      <div className="chart-plot">
        <div className="chart-gridlines">
          <i />
          <i />
          <i />
          <i />
        </div>
        {sum === 0 && (
          <div className="no-chart-data">
            <span className="square-icon">
              <TrendingUp size={20} />
            </span>
            <strong>No sales in this period</strong>
            <small>Your trend takes shape with every sale.</small>
          </div>
        )}
        <div className="chart-bars">
          {values.map((v, i) => (
            <div key={i}>
              <div className="chart-bar-track">
                <span
                  title={money(v)}
                  style={{
                    height: v ? Math.max((v / max) * 100, 3) + "%" : "0%",
                  }}
                />
              </div>
              <small>
                {new Date(days[i] + "T12:00:00").toLocaleDateString("en", {
                  weekday: "short",
                })}
              </small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
export function Inventory({ alerts = false }: { alerts?: boolean }) {
  const { data, money, act } = useWorkspace();
  const [category, setCategory] = useState("all");
  const products = data.products.filter(
    (p) =>
      (!alerts ||
        p.stock <= p.threshold ||
        (p.variants || []).some((v: Row) => v.stock <= v.threshold)) &&
      (category === "all" || p.category === category),
  );
  const totalUnits = products.reduce(
    (sum, p) =>
      sum + p.stock + (p.variants || []).reduce((n: number, v: Row) => n + v.stock, 0),
    0,
  );
  const stockValue = products.reduce(
    (sum, p) =>
      sum +
      multiplyMinor(p.cost, p.stock) +
      (p.variants || []).reduce(
        (n: number, v: Row) => n + multiplyMinor(v.cost, v.stock),
        0,
      ),
    0,
  );
  return (
    <>
      <PageTitle
        eyebrow="PRODUCTS & STOCK"
        title={alerts ? "Stock alerts" : "Inventory"}
        description={
          alerts
            ? "A little attention now keeps business moving later."
            : "A place for every product. A clear view of every shelf."
        }
        actions={
          <>
            <ExportButton kind="inventory" low={alerts} />
            <Button onClick={() => act("product")}>
              <Plus size={17} />
              Add product
            </Button>
          </>
        }
      />
      <div className="compact-stats">
        <div>
          <span>{alerts ? "Needs attention" : "Active products"}</span>
          <strong>{products.length}</strong>
        </div>
        <div>
          <span>Units on hand</span>
          <strong>
            {totalUnits.toLocaleString()}
          </strong>
        </div>
        <div>
          <span>Stock value at cost</span>
          <strong>
            {money(stockValue)}
          </strong>
        </div>
        <div>
          <span>Out of stock</span>
          <strong>
            {products.reduce(
              (sum, p) =>
                sum +
                Number(p.stock === 0) +
                (p.variants || []).filter((v: Row) => v.stock === 0).length,
              0,
            )}
          </strong>
        </div>
      </div>
      <div className="list-filter">
        <label>
          <SlidersHorizontal size={16} />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
            {[...new Set(data.products.map((p) => p.category))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <span className="muted">
          {alerts
            ? "Showing products at or below their reorder level"
            : "Stock is specific to the selected branch"}
        </span>
        <Button variant="ghost" onClick={() => act("import")}>
          Import CSV <ArrowDownLeft size={15} />
        </Button>
      </div>
      <DataTable
        rows={products}
        searchPlaceholder="Search products, SKU or barcode…"
        emptyTitle={
          alerts ? "Your shelves are looking good" : "Your shelves start here"
        }
        emptyDescription={
          alerts
            ? "There are no products at or below their reorder level."
            : "Add your first product to start tracking stock and making sales."
        }
        columns={[
          {
            key: "name",
            label: "Product",
            render: (p) => (
              <div className="product-cell">
                <span className="product-thumb">
                  <ProductPhoto
                    src={p.image_url}
                    alt={`${p.name} product`}
                  />
                </span>
                <div>
                  <strong>{p.name}</strong>
                  <small>
                    {p.category} · {p.unit}
                  </small>
                  {(p.variants || []).map((variant: Row) => (
                    <div className="variant-line" key={variant.id}>
                      <button
                        className="text-link"
                        onClick={() =>
                          act("variant", {
                            ...variant,
                            variant_id: variant.id,
                            product_id: p.id,
                            product_name: p.name,
                          })
                        }
                      >
                        {variant.name} · {variant.sku}
                      </button>
                      <small>{variant.stock} {p.unit}</small>
                      <Badge
                        tone={
                          variant.stock === 0
                            ? "red"
                            : variant.stock <= variant.threshold
                              ? "amber"
                              : "mint"
                        }
                      >
                        {variant.stock === 0
                          ? "Out"
                          : variant.stock <= variant.threshold
                            ? "Low"
                            : "In stock"}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Show QR code for ${p.name} ${variant.name}`}
                        onClick={() =>
                          act("qr", {
                            id: `${p.id}:${variant.id}`,
                            name: `${p.name} · ${variant.name}`,
                            sku: variant.sku,
                          })
                        }
                      >
                        <QrCode size={14} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          act("stock", {
                            ...variant,
                            variant_id: variant.id,
                            product_id: p.id,
                            name: `${p.name} · ${variant.name}`,
                            unit: p.unit,
                          })
                        }
                      >
                        Adjust
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ),
          },
          {
            key: "sku",
            label: "SKU",
            render: (p) => <span className="mono muted">{p.sku}</span>,
          },
          { key: "cost", label: "Cost price", render: (p) => money(p.cost) },
          {
            key: "price",
            label: "Selling price",
            render: (p) => money(p.price),
          },
          {
            key: "stock",
            label: "Stock",
            render: (p) => (
              <strong>
                {p.stock} <small className="muted">{p.unit}</small>
              </strong>
            ),
          },
          {
            key: "status",
            label: "Status",
            render: (p) => (
              <Badge
                tone={
                  p.stock === 0
                    ? "red"
                    : p.stock <= p.threshold
                      ? "amber"
                      : "mint"
                }
              >
                {p.stock === 0
                  ? "Out of stock"
                  : p.stock <= p.threshold
                    ? "Low stock"
                    : "In stock"}
              </Badge>
            ),
          },
          {
            key: "actions",
            label: "Manage",
            render: (p) => (
              <div className="row">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    act("variant", { ...p, product_id: p.id, product_name: p.name })
                  }
                >
                  Add variant
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => act("stock", p)}
                >
                  Adjust
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={"Show QR code for " + p.name}
                  onClick={() => act("qr", p)}
                >
                  <QrCode size={16} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={"Edit " + p.name}
                  onClick={() => act("product", p)}
                >
                  <MoreHorizontal size={17} />
                </Button>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
const labels: Record<string, [string, string, string]> = {
  sales: ["Sales", "Every checkout, all in one place.", "New sale"],
  customers: [
    "Customers",
    "The people at the heart of your business.",
    "Add customer",
  ],
  suppliers: [
    "Suppliers",
    "Good relationships keep your shelves stocked.",
    "Add supplier",
  ],
  purchases: [
    "Purchases",
    "From purchase order to a well-stocked shelf.",
    "Create purchase",
  ],
  expenses: [
    "Expenses",
    "Keep track of what it takes to run your business.",
    "Add expense",
  ],
  staff: [
    "Your team",
    "The right people, with the right access.",
    "Add team member",
  ],
  branches: [
    "Branches",
    "One business. Room for more possibilities.",
    "Add branch",
  ],
  downloads: ["Downloads", "Your exports, ready when you need them.", ""],
};
export function Records({ kind }: { kind: string }) {
  const { data, money, act, canManage } = useWorkspace();
  const [title, desc, cta] = labels[kind];
  const [filter, setFilter] = useState("all");
  const party = kind === "customers" || kind === "suppliers";
  let rows: Row[] = party
    ? data.parties.filter(
        (p) => p.kind === (kind === "customers" ? "customer" : "supplier"),
      )
    : (data as any)[kind] || [];
  if (filter !== "all") rows = rows.filter((r) => r.status === filter);
  const cols: Column[] = party
    ? [
        {
          key: "name",
          label: "Name",
          render: (r) => (
            <div className="product-cell">
              <span className="contact-avatar">
                {r.name.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <strong>{r.name}</strong>
                <small>{r.email || "No email added"}</small>
              </div>
            </div>
          ),
        },
        { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
        { key: "address", label: "Address", render: (r) => r.address || "—" },
        {
          key: "balance",
          label: "Outstanding · this branch",
          render: (r) =>
            money(
              kind === "customers"
                ? data.sales
                    .filter(
                      (s) => s.customer_id === r.id && s.status === "completed",
                    )
                    .reduce((n, s) => n + s.total - s.paid, 0)
                : data.purchases
                    .filter(
                      (p) => p.supplier_id === r.id && p.status === "received",
                    )
                    .reduce((n, p) => n + p.total - p.paid, 0),
            ),
        },
      ]
    : kind === "sales"
      ? [
          {
            key: "reference",
            label: "Receipt",
            render: (r) => (
              <button
                className="text-link mono"
                onClick={() => act("receipt", r)}
              >
                {r.reference}
              </button>
            ),
          },
          {
            key: "created_at",
            label: "Date",
            render: (r) => <Time value={r.created_at} />,
          },
          { key: "customer", label: "Customer" },
          { key: "total", label: "Total", render: (r) => money(r.total) },
          {
            key: "paid",
            label: "Outstanding",
            render: (r) =>
              money(r.status === "refunded" ? 0 : r.total - r.paid),
          },
          {
            key: "method",
            label: "Payment",
            render: (r) => <Badge>{r.method}</Badge>,
          },
          {
            key: "status",
            label: "Status",
            render: (r) => (
              <Badge tone={r.status === "completed" ? "mint" : "red"}>
                {r.status}
              </Badge>
            ),
          },
          {
            key: "actions",
            label: "Actions",
            render: (r) => (
              <div className="row">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => act("invoice", r)}
                >
                  Invoice
                </Button>
                {r.status === "completed" && canManage && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => act("refund", r)}
                    >
                      Refund
                    </Button>
                    {r.total > r.paid && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => act("payment", { ...r, kind: "sales" })}
                      >
                        Record payment
                      </Button>
                    )}
                  </>
                )}
              </div>
            ),
          },
        ]
      : kind === "purchases"
        ? [
            {
              key: "reference",
              label: "Order",
              render: (r) => <span className="mono">{r.reference}</span>,
            },
            { key: "supplier", label: "Supplier" },
            { key: "product", label: "Product" },
            { key: "quantity", label: "Quantity" },
            { key: "total", label: "Total", render: (r) => money(r.total) },
            {
              key: "paid",
              label: "Outstanding",
              render: (r) =>
                r.status === "received"
                  ? money(r.total - r.paid)
                  : "Not received",
            },
            {
              key: "status",
              label: "Status",
              render: (r) => (
                <Badge tone={r.status === "received" ? "mint" : "amber"}>
                  {r.status}
                </Badge>
              ),
            },
            {
              key: "actions",
              label: "Actions",
              render: (r) =>
                r.status === "ordered" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => act("receive", r)}
                  >
                    Receive goods
                  </Button>
                ) : r.paid < r.total ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => act("payment", { ...r, kind: "purchases" })}
                  >
                    Record payment
                  </Button>
                ) : (
                  <Badge tone="mint">Paid</Badge>
                ),
            },
          ]
        : kind === "expenses"
          ? [
              { key: "name", label: "Description" },
              {
                key: "category",
                label: "Category",
                render: (r) => <Badge>{r.category}</Badge>,
              },
              { key: "date", label: "Date" },
              {
                key: "amount",
                label: "Amount",
                render: (r) => money(r.amount),
              },
            ]
          : kind === "branches"
            ? [
                {
                  key: "name",
                  label: "Branch",
                  render: (r) => (
                    <div className="product-cell">
                      <span className="square-icon">
                        <Store size={19} />
                      </span>
                      <div>
                        <strong>{r.name}</strong>
                        {r.is_default ? <small><Badge tone="violet">Main branch</Badge></small> : null}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "address",
                  label: "Location",
                  render: (r) => r.address || "—",
                },
                { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
                {
                  key: "active",
                  label: "Status",
                  render: (r) => (
                    <Badge tone={r.active ? "mint" : "neutral"}>
                      {r.active ? "Active" : "Archived"}
                    </Badge>
                  ),
                },
                {
                  key: "actions",
                  label: "Manage",
                  render: (r) => (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => act("branch", r)}
                    >
                      Edit details
                    </Button>
                  ),
                },
              ]
            : kind === "staff"
              ? [
                  { key: "name", label: "Team member" },
                  { key: "email", label: "Email" },
                  {
                    key: "role",
                    label: "Role",
                    render: (r) => (
                      <Badge tone={r.role === "owner" ? "violet" : "neutral"}>
                        {r.role}
                      </Badge>
                    ),
                  },
                  {
                    key: "branch_id",
                    label: "Branch",
                    render: (r) =>
                      data.branches.find((b) => b.id === r.branch_id)?.name ||
                      "—",
                  },
                  {
                    key: "account_status",
                    label: "Access",
                    render: (r) => {
                      const status =
                        r.account_status || (r.active ? "active" : "suspended");
                      const tone =
                        status === "suspended"
                          ? "red"
                          : status === "pending"
                            ? "amber"
                            : "mint";
                      const label =
                        status === "suspended"
                          ? "Suspended"
                          : status === "pending"
                            ? "Pending"
                            : "Active";
                      return <Badge tone={tone}>{label}</Badge>;
                    },
                  },
                  {
                    key: "expires_at",
                    label: "Expiry",
                    render: (r) => {
                      if (!r.expires_at) return "Never";
                      const date = new Date(r.expires_at);
                      const expired = date.getTime() <= Date.now();
                      return (
                        <span className={expired ? "muted" : ""}>
                          {date.toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      );
                    },
                  },
                  {
                    key: "actions",
                    label: "Manage",
                    render: (r) =>
                      r.role !== "owner" && !r.invited && (
                        <div className="row wrap">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => act("staff-edit", r)}
                          >
                            Edit details / role
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => act("staff-toggle", r)}
                          >
                            {(r.account_status || (r.active ? "active" : "suspended")) === "suspended"
                              ? "Restore access"
                              : "Suspend access"}
                          </Button>
                        </div>
                      ),
                  },
                ]
              : [
                  {
                    key: "name",
                    label: "File",
                    render: (r) => (
                      <div className="row">
                        <Download size={17} />
                        <strong>{r.name}</strong>
                      </div>
                    ),
                  },
                  { key: "scope", label: "Scope" },
                  {
                    key: "created_at",
                    label: "Generated",
                    render: (r) => <Time value={r.created_at} />,
                  },
                  {
                    key: "actions",
                    label: "Download",
                    render: (r) => (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const url = URL.createObjectURL(
                            new Blob([r.content], {
                              type: "text/csv;charset=utf-8",
                            }),
                          );
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = r.name;
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 0);
                        }}
                      >
                        Download CSV <Download size={14} />
                      </Button>
                    ),
                  },
                ];
  const canAdd =
    kind === "sales" ||
    (canManage &&
      ((kind !== "staff" && kind !== "branches") ||
        data.user.role === "owner"));
  return (
    <>
      <PageTitle
        eyebrow={party ? "RELATIONSHIPS" : "YOUR WORKSPACE"}
        title={title}
        description={desc}
        actions={
          <>
            {["sales", "expenses"].includes(kind) && canManage && (
              <ExportButton kind={kind} />
            )}
            {cta &&
              canAdd &&
              (kind === "sales" ? (
                <Button asChild>
                  <Link to="/app/pos">
                    <Plus size={17} />
                    {cta}
                  </Link>
                </Button>
              ) : (
                <Button
                  onClick={() =>
                    act(
                      kind === "customers"
                        ? "customer"
                        : kind === "suppliers"
                          ? "supplier"
                          : kind === "purchases"
                            ? "purchase"
                            : kind === "expenses"
                              ? "expense"
                              : kind === "staff"
                                ? "staff"
                                : "branch",
                    )
                  }
                >
                  <Plus size={17} />
                  {cta}
                </Button>
              ))}
          </>
        }
      />
      {kind === "purchases" && (
        <div className="info-strip">
          <ShieldCheck size={18} /> Purchase orders don’t change inventory.
          Receive goods to update stock and create a payable.
        </div>
      )}
      {(kind === "sales" || kind === "purchases") && (
        <div className="tab-bar">
          {[
            "all",
            ...(kind === "sales"
              ? ["completed", "refunded"]
              : ["ordered", "received"]),
          ].map((t) => (
            <button
              className={filter === t ? "active" : ""}
              onClick={() => setFilter(t)}
              key={t}
            >
              {t === "all" ? "All records" : t}
            </button>
          ))}
        </div>
      )}
      <DataTable
        key={kind}
        rows={rows}
        columns={cols}
        emptyTitle={
          kind === "downloads"
            ? "Your files will live here"
            : `No ${kind === "staff" ? "team members" : kind} yet`
        }
        emptyDescription={
          kind === "downloads"
            ? "Export a report or inventory list to create your first downloadable file."
            : "Add your first record to get started. Everything you save stays connected to your business."
        }
      />
      {party && (
        <div className="info-strip">
          <Wallet size={18} /> Balances are calculated from completed credit
          sales or received purchases in this branch. Record payments from the
          Sales or Purchases page.
        </div>
      )}
    </>
  );
}
export function Time({ value }: { value: string }) {
  const { data } = useWorkspace();
  return (
    <span className="muted">
      {new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: data.business.timezone,
      }).format(new Date(value))}
    </span>
  );
}
export function Transactions() {
  const { data, money } = useWorkspace();
  const [tab, setTab] = useState("All"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [period, setPeriod] = useState({ from: "", to: "" });
  const rows = data.events.filter(
    (e) =>
      (tab === "All" || e.category === tab) &&
      (!period.from ||
        dateKey(e.created_at, data.business.timezone) >= period.from) &&
      (!period.to ||
        dateKey(e.created_at, data.business.timezone) <= period.to),
  );
  return (
    <>
      <PageTitle
        eyebrow="THE BIGGER PICTURE"
        title="Transactions"
        description="A connected history of your business, one action at a time."
        actions={
          <ExportButton kind="transactions" from={period.from} to={period.to} />
        }
      />
      <div className="row between wrap">
        <div className="tab-bar">
          {["All", "Suppliers", "Customers", "Products"].map((t) => (
            <button
              className={tab === t ? "active" : ""}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="period-filter">
          <input
            type="date"
            aria-label="Start date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span>to</span>
          <input
            type="date"
            aria-label="End date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPeriod({ from, to })}
          >
            Apply
          </Button>
        </div>
      </div>
      <DataTable
        rows={rows}
        columns={[
          {
            key: "created_at",
            label: "Date / time",
            render: (r) => <Time value={r.created_at} />,
          },
          {
            key: "category",
            label: "Category",
            render: (r) => <Badge>{r.category}</Badge>,
          },
          { key: "entity", label: "Entity" },
          { key: "description", label: "Activity" },
          {
            key: "reference",
            label: "Reference",
            render: (r) => (
              <span className="mono muted">{r.reference.slice(0, 12)}</span>
            ),
          },
          {
            key: "amount",
            label: "Impact",
            render: (r) =>
              r.category === "Products"
                ? `${r.amount > 0 ? "+" : ""}${r.amount} units`
                : money(r.amount),
          },
          { key: "actor", label: "Recorded by" },
        ]}
        emptyTitle="Your story starts here"
        emptyDescription="Sales, purchases, payments and stock movements will create a traceable history."
      />
      <p className="subtle-note">
        Export includes all categories in the selected date range and branch.
        The view shows up to the latest 2,000 events.
      </p>
    </>
  );
}
export function Reports() {
  const { data, money } = useWorkspace();
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const sales = data.sales.filter(
    (s) =>
      s.status === "completed" &&
      (!from || dateKey(s.created_at, data.business.timezone) >= from) &&
      (!to || dateKey(s.created_at, data.business.timezone) <= to),
  );
  const items = data.items.filter((i) => sales.some((s) => s.id === i.sale_id));
  const revenue = sales.reduce((n, s) => n + s.total - s.tax, 0),
    cogs = items.reduce((n, i) => n + multiplyMinor(i.cost, i.quantity), 0);
  const expenses = data.expenses
    .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
    .reduce((n, e) => n + e.amount, 0);
  const top = Object.values(
    items.reduce<Record<string, Row>>((acc, i) => {
      if (!acc[i.product_id])
        acc[i.product_id] = {
          id: i.product_id,
          name: i.name,
          quantity: 0,
          revenue: 0,
        };
      acc[i.product_id].quantity += i.quantity;
      acc[i.product_id].revenue += multiplyMinor(i.price, i.quantity);
      return acc;
    }, {}),
  );
  return (
    <>
      <PageTitle
        eyebrow="INSIGHT INTO ACTION"
        title="Sales & reports"
        description="The numbers behind your next decision. Always grounded in real records."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link to="/app/reports/eod">
                <FileText size={16} /> Cashier EOD Reports
              </Link>
            </Button>
            <ExportButton kind="sales" from={from} to={to} />
          </>
        }
      />
      <div className="list-filter">
        <span className="row">
          <CalendarDays size={17} /> Reporting period
        </span>
        <div className="period-filter">
          <input
            type="date"
            aria-label="Report start date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span>to</span>
          <input
            type="date"
            aria-label="Report end date"
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            All time
          </Button>
        </div>
        <small className="muted">{data.business.timezone}</small>
      </div>
      <div className="stats-grid report-stats">
        <Stat
          label="Net sales before tax"
          value={money(revenue)}
          description="After discounts · excluding refunds"
          icon={ShoppingBag}
          to="/app/sales"
        />
        <Stat
          label="Cost of goods sold"
          value={money(cogs)}
          description="Cost frozen at time of sale"
          icon={Package}
          tone="blue"
          to="/app/sales"
        />
        <Stat
          label="Gross profit"
          value={money(revenue - cogs)}
          description="Net sales less cost of goods"
          icon={TrendingUp}
          tone="violet"
          to="/app/sales"
        />
        <Stat
          label="Operating result"
          value={money(revenue - cogs - expenses)}
          description="Gross profit less recorded expenses"
          icon={Wallet}
          tone="amber"
          to="/app/expenses"
        />
      </div>
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h3>Sales performance</h3>
            <p>Recent 7 days within your selected period</p>
          </div>
          <Badge>{sales.length} completed sales in period</Badge>
        </div>
        <SalesChart from={from} to={to} />
      </div>
      <div className="section-label">
        <h2>Products sold</h2>
        <small className="muted">
          Line totals before sale-level discounts and tax
        </small>
      </div>
      <DataTable
        rows={top}
        columns={[
          { key: "name", label: "Product" },
          { key: "quantity", label: "Units sold" },
          {
            key: "revenue",
            label: "Line total",
            render: (r) => money(r.revenue),
          },
        ]}
        emptyTitle="Your insights are on their way"
        emptyDescription="Complete a sale to start building your product performance report."
      />
    </>
  );
}

type CashierShiftReport = Row & {
  cashier: string;
  report: {
    sales: Row[];
    items: Row[];
  };
};

export function CashierEodReports() {
  const { branch, data, money } = useWorkspace();
  const [shifts, setShifts] = useState<CashierShiftReport[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cashierId, setCashierId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({ branch });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    api<{ shifts: CashierShiftReport[] }>(`/cashier-shifts?${params}`)
      .then(({ shifts: rows }) => {
        if (active) setShifts(rows || []);
      })
      .catch((reason) => {
        if (active) setError((reason as Error).message);
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [branch, from, to]);

  const visibleShifts = shifts.filter((shift) =>
    (cashierId === "all" || shift.cashier_id === cashierId) &&
    (!from || dateKey(shift.closed_at, data.business.timezone) >= from) &&
    (!to || dateKey(shift.closed_at, data.business.timezone) <= to),
  );
  const cashiers = [...new Map(
    shifts.map((shift) => [shift.cashier_id, shift.cashier]),
  )];

  return (
    <>
      <PageTitle
        eyebrow="CASH CONTROL"
        title="Cashier EOD Reports"
        description="Submitted shift reconciliations, cash variances, transactions, and items sold."
        actions={<Link className="text-link" to="/app/reports">Sales & reports</Link>}
      />
      <div className="list-filter eod-filter">
        <div className="period-filter">
          <label className="field">
            <span>From</span>
            <input type="date" aria-label="EOD start date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" aria-label="EOD end date" min={from} value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label className="field">
            <span>Cashier</span>
            <select aria-label="Filter EOD reports by cashier" value={cashierId} onChange={(event) => setCashierId(event.target.value)}>
              <option value="all">All cashiers</option>
              {cashiers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        </div>
        <small className="muted">{data.business.timezone}</small>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {loading ? (
        <div className="panel"><p className="muted">Loading submitted reconciliations…</p></div>
      ) : visibleShifts.length ? (
        <div className="eod-report-list">
          {visibleShifts.map((shift) => (
            <article className="panel eod-report" key={shift.id}>
              <div className="panel-heading">
                <div>
                  <h3>{shift.cashier}</h3>
                  <p>{new Date(shift.opened_at).toLocaleString()} to {new Date(shift.closed_at).toLocaleString()}</p>
                </div>
                <Badge tone={shift.variance === 0 ? "mint" : "amber"}>
                  {shift.variance === 0 ? "Balanced" : `Variance ${money(shift.variance)}`}
                </Badge>
              </div>
              <div className="eod-summary">
                <div><small>Sales</small><strong>{shift.sales_count}</strong></div>
                <div><small>Sales total</small><strong>{money(shift.sales_total)}</strong></div>
                <div><small>Opening cash</small><strong>{money(shift.opening_cash)}</strong></div>
                <div><small>Expected cash</small><strong>{money(shift.expected_cash)}</strong></div>
                <div><small>Counted cash</small><strong>{money(shift.counted_cash)}</strong></div>
              </div>
              <h4>Items sold</h4>
              <DataTable
                rows={shift.report?.items || []}
                columns={[
                  { key: "name", label: "Item" },
                  { key: "sku", label: "SKU" },
                  { key: "quantity", label: "Quantity" },
                  { key: "total", label: "Line total", render: (row) => money(row.total) },
                ]}
                emptyTitle="No items sold"
                emptyDescription="This shift has no completed sales."
              />
              <h4>Transactions</h4>
              <DataTable
                rows={shift.report?.sales || []}
                columns={[
                  { key: "reference", label: "Sale" },
                  { key: "created_at", label: "Time", render: (row) => new Date(row.created_at).toLocaleTimeString() },
                  { key: "method", label: "Method" },
                  { key: "total", label: "Total", render: (row) => money(row.total) },
                ]}
                emptyTitle="No transactions"
                emptyDescription="No completed sales were recorded during this shift."
              />
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No submitted shifts"
          description="Submitted cashier closeouts for this branch and period will appear here."
          icon={FileText}
        />
      )}
    </>
  );
}

export function SettingsPage({ profile = false }: { profile?: boolean }) {
  const { data, write, refresh, notify, setTheme } = useWorkspace();
  const [tab, setTab] = useState("general");
  return (
    <>
      <PageTitle
        eyebrow="MAKE IT YOURS"
        title={profile ? "My profile" : "Business settings"}
        description={
          profile
            ? "Your details, your preferences, your workspace."
            : "The details that make this business your business."
        }
        actions={
          !profile && (
            <Button asChild variant="secondary">
              <Link to="/app/settings/documents">
                <FileText size={16} /> Document templates
              </Link>
            </Button>
          )
        }
      />
      <div className="settings-layout">
        <aside className="settings-tabs">
          {(profile
            ? ["general", "appearance", "security"]
            : ["general", "capabilities", "integrations"]
          ).map((s) => (
            <button
              key={s}
              className={s === tab ? "active" : ""}
              onClick={() => setTab(s)}
            >
              {s === "general"
                ? profile
                  ? "Personal details"
                  : "Business profile"
                : s}
            </button>
          ))}
        </aside>
        <section className="panel settings-panel">
          {tab === "general" ? (
            <>
              <div className="panel-heading">
                <div>
                  <h3>{profile ? "Personal details" : "Business profile"}</h3>
                  <p>
                    {profile
                      ? "How you appear in your workspace."
                      : "Used throughout your workspace and on receipts."}
                  </p>
                </div>
              </div>
              <Form
                key={String(profile)}
                onSubmit={async (f) => {
                  if (profile) {
                    await write(
                      "/profile",
                      { name: f.get("name"), theme: data.user.theme },
                      "PUT",
                    );
                  } else {
                    const submitted = Object.fromEntries(f);
                    await api("/business", submitted, "PUT");
                    const saved = await refresh();
                    if (saved.business.category !== submitted.category) {
                      throw new Error(
                        "Business category was not confirmed by the database. Apply supabase/migrations/20261031210000_business_category_persistence.sql, then try again.",
                      );
                    }
                    if (saved.business.currency !== submitted.currency) {
                      throw new Error(
                        "Business currency was not confirmed by the database. Apply supabase/migrations/20261031200000_dynamic_currency_support.sql, then try again.",
                      );
                    }
                  }
                  notify("Your changes have been saved.");
                }}
              >
                <Fields
                  fields={
                    profile
                      ? [
                          {
                            name: "name",
                            label: "Full name",
                            value: data.user.name,
                          },
                        ]
                      : [
                          {
                            name: "name",
                            label: "Business name",
                            value: data.business.name,
                          },
                          {
                            name: "category",
                            label: "Business category",
                            value: data.business.category || "Retail",
                            options: businessCategories.map((value) => ({
                              value,
                              label: value,
                            })),
                            otherOption: true,
                            otherFieldName: "custom_category",
                            otherValue: data.business.custom_category,
                          },
                          {
                            name: "email",
                            label: "Business email",
                            type: "email",
                            value: data.business.email,
                            required: false,
                          },
                          {
                            name: "phone",
                            label: "Phone number",
                            value: data.business.phone,
                            required: false,
                          },
                          {
                            name: "tax_id",
                            label: "Tax / registration ID",
                            value: data.business.tax_id,
                            required: false,
                          },
                          {
                            name: "country",
                            label: "Country",
                            value: data.business.country,
                            options: countryOptions,
                          },
                          {
                            name: "currency",
                            label: "Business currency",
                            value: data.business.currency,
                            options: currencyOptions,
                            help: "Updates currency labels across this workspace. Historical amounts are not converted.",
                          },
                          {
                            name: "timezone",
                            label: "Timezone",
                            value: data.business.timezone,
                          },
                          {
                            name: "address",
                            label: "Business address",
                            type: "textarea",
                            value: data.business.address,
                            required: false,
                          },
                        ]
                  }
                />
                {profile && (
                  <div className="profile-meta">
                    <span>{data.user.email}</span>
                    <Badge>{data.user.role}</Badge>
                    <small>
                      Email changes and account deletion require administrator
                      support in this edition.
                    </small>
                  </div>
                )}
              </Form>
            </>
          ) : tab === "appearance" ? (
            <>
              <h3>A workspace that feels like you.</h3>
              <p className="muted">
                Your theme preference is saved to your account.
              </p>
              <div className="theme-options">
                {(["dark", "light"] as const).map((t) => (
                  <button
                    key={t}
                    className={
                      "theme-preview " +
                      t +
                      (data.user.theme === t ? " selected" : "")
                    }
                    onClick={() => setTheme(t)}
                  >
                    <div>
                      <i />
                      <div>
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                    <strong>
                      {t} mode {data.user.theme === t && <Check size={16} />}
                    </strong>
                  </button>
                ))}
              </div>
            </>
          ) : tab === "security" ? (
            <>
              <h3>Change password</h3>
              <p className="muted">
                Updating your password signs out other sessions.
              </p>
              <Form
                onSubmit={async (f) => {
                  await write("/password", Object.fromEntries(f));
                  notify("Password updated. Other sessions have been revoked.");
                }}
                submit="Update password"
              >
                <Fields
                  fields={[
                    {
                      name: "current",
                      label: "Current password",
                      type: "password",
                    },
                    {
                      name: "password",
                      label: "New password",
                      type: "password",
                      help: "Use at least 10 characters.",
                    },
                  ]}
                />
              </Form>
            </>
          ) : tab === "capabilities" ? (
            <>
              <h3>Built around your business</h3>
              <p className="muted">
                Capabilities available in this local edition.
              </p>
              {[
                [
                  "Retail products",
                  "Catalog, branch inventory and cash checkout",
                  true,
                ],
                [
                  "Customer & supplier credit",
                  "Credit sales, payables and partial cash payments",
                  true,
                ],
                [
                  "Variants & divisible quantities",
                  "Variant tracking and fractional quantities are available",
                  true,
                ],
                ...(data.business.category === "Restaurant"
                  ? [
                      [
                        "Restaurant mode",
                        "Tables, kitchen routing and restaurant order workflows",
                        true,
                      ],
                    ]
                  : []),
                [
                  "Online wallets",
                  "Requires a verified provider and reconciliation",
                  false,
                ],
              ].map(([a, b, on]) => (
                <div className="capability" key={String(a)}>
                  <div>
                    <strong>{a}</strong>
                    <small>{b}</small>
                  </div>
                  <Badge tone={on ? "mint" : "neutral"}>
                    {on ? "Available" : "Not integrated"}
                  </Badge>
                </div>
              ))}
            </>
          ) : (
            <>
              <h3>External integrations</h3>
              <p className="muted">
                These services require configuration and verification before
                use.
              </p>
              {[
                "Online payments & mobile money",
                "Email invitations & notifications",
                "Subscription billing",
                "Fiscal / government invoicing",
                "Offline POS & PWA",
              ].map((s) => (
                <div className="capability" key={s}>
                  <strong>{s}</strong>
                  <Badge>Not connected</Badge>
                </div>
              ))}
              <div className="info-strip">
                <ShieldCheck size={18} /> Current checkout records cash or
                customer credit. It does not verify an external payment.
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
export function POS() {
  const { data, branch, money, scale, write, act, canManage, notify } = useWorkspace();
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("All"),
    [cart, setCart] = useState<
      { product_id: string; variant_id?: string; quantity: number }[]
    >([]),
    [customer, setCustomer] = useState(""),
    [method, setMethod] = useState("cash"),
    [discount, setDiscount] = useState("0"),
    [tax, setTax] = useState("0"),
    [cash, setCash] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [cashierShift, setCashierShift] = useState<Row | null>(null);
  const [shiftLoading, setShiftLoading] = useState(data.user.role === "cashier");
  const [shiftBusy, setShiftBusy] = useState(false);
  const [openingCash, setOpeningCash] = useState("0");
  const [countedCash, setCountedCash] = useState("");
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    if (data.user.role !== "cashier") return;
    let active = true;
    setShiftLoading(true);
    api<{ shift: Row | null }>(
      `/cashier-shifts?scope=active&branch=${encodeURIComponent(branch)}`,
    )
      .then(({ shift }) => active && setCashierShift(shift))
      .catch((reason) => active && setError((reason as Error).message))
      .finally(() => active && setShiftLoading(false));
    return () => { active = false; };
  }, [branch, data.user.role]);
  const sellableProducts = data.products.flatMap((p) => [
    { ...p, variant_id: undefined, base_name: p.name },
    ...(p.variants || []).map((v: Row) => ({
      ...p,
      ...v,
      id: p.id,
      variant_id: v.id,
      base_name: p.name,
      name: `${p.name} · ${v.name}`,
    })),
  ]);
  const products = sellableProducts.filter(
    (p) =>
      (category === "All" || p.category === category) &&
      [p.name, p.sku, p.barcode].some((v: string) =>
        v.toLowerCase().includes(search.toLowerCase()),
      ),
  );
  let discountAmount = 0,
    taxBps = 0;
  try {
    discountAmount = toMinor(discount, scale);
    taxBps = toMinor(tax, 2);
  } catch {}
  const subtotal = cart.reduce((n, i) => {
    const p = sellableProducts.find(
      (item) => item.id === i.product_id && item.variant_id === i.variant_id,
    );
    return n + (p ? multiplyMinor(p.price, i.quantity) : 0);
  }, 0),
    taxAmount = Number(
      (BigInt(Math.max(0, subtotal - discountAmount)) * BigInt(taxBps) +
        5000n) /
        10000n,
    ),
    total = subtotal - discountAmount + taxAmount;
  const shiftSales = cashierShift
    ? data.sales.filter((sale) => sale.shift_id === cashierShift.id && sale.status === "completed")
    : [];
  const expectedCash = (cashierShift?.opening_cash || 0) + shiftSales
    .filter((sale) => sale.method === "cash")
    .reduce((sum, sale) => sum + sale.paid, 0);
  function update(id: string, variantId: string | undefined, delta: number) {
    setError("");
    const product = sellableProducts.find(
      (p) => p.id === id && p.variant_id === variantId,
    );
    const available = product?.stock || 0;
    const current =
      cart.find((i) => i.product_id === id && i.variant_id === variantId)
        ?.quantity || 0;
    if (
      current + delta > available
    ) {
      setError("There is not enough stock for this quantity.");
      return;
    }
    key.current = crypto.randomUUID();
    setCart((prev) => {
      const q = current + delta;
      if (q > available) return prev;
      return q <= 0
        ? prev.filter(
            (i) => i.product_id !== id || i.variant_id !== variantId,
          )
        : prev.some(
              (i) => i.product_id === id && i.variant_id === variantId,
            )
          ? prev.map((i) =>
              i.product_id === id && i.variant_id === variantId
                ? { ...i, quantity: q }
                : i,
            )
          : [...prev, { product_id: id, variant_id: variantId, quantity: q }];
    });
  }
  function setQuantity(
    id: string,
    variantId: string | undefined,
    next: number,
  ) {
    if (!Number.isFinite(next) || next <= 0) return;
    const product = sellableProducts.find(
      (p) => p.id === id && p.variant_id === variantId,
    );
    if (!product || Math.abs(next * 1000 - Math.round(next * 1000)) >= 1e-8) {
      setError("Use a quantity with up to three decimal places.");
      return;
    }
    if (next > product.stock) {
      setError("There is not enough stock for this quantity.");
      return;
    }
    setError("");
    key.current = crypto.randomUUID();
    setCart((previous) =>
      previous.map((i) =>
        i.product_id === id && i.variant_id === variantId
          ? { ...i, quantity: next }
          : i,
      ),
    );
  }

  async function startCashierShift() {
    setShiftBusy(true);
    setError("");
    try {
      const result = await write("/cashier-shifts", {
        action: "open",
        opening_cash: toMinor(openingCash, scale),
      });
      setCashierShift(result.shift);
      notify("Cashier shift started.");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setShiftBusy(false);
    }
  }

  async function submitCashierShift() {
    setShiftBusy(true);
    setError("");
    try {
      const result = await write("/cashier-shifts", {
        action: "close",
        counted_cash: toMinor(countedCash, scale),
      });
      setCashierShift(null);
      setCountedCash("");
      notify(`Shift reconciliation submitted. Variance: ${money(result.shift.variance)}.`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setShiftBusy(false);
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="LET’S DO BUSINESS"
        title="Point of sale"
        description="A smoother checkout, from the first item to the last receipt."
        actions={
          <Badge tone="mint">
            <span className="live-dot" /> Cash & credit checkout
          </Badge>
        }
      />
      {data.user.role === "cashier" && (
        <section className="panel cashier-shift-panel">
          <div>
            <h3>{cashierShift ? "Shift in progress" : "Cashier shift"}</h3>
            <p className="muted">
              {cashierShift
                ? `Started ${new Date(cashierShift.opened_at).toLocaleString()} · ${shiftSales.length} sales · expected cash ${money(expectedCash)}`
                : "Start a shift before completing sales."}
            </p>
          </div>
          {cashierShift ? (
            <div className="cashier-shift-controls">
              <label className="field">
                <span>Counted cash ({data.business.currency})</span>
                <input
                  type="number"
                  min="0"
                  step={1 / 10 ** scale}
                  value={countedCash}
                  onChange={(event) => setCountedCash(event.target.value)}
                  placeholder={(expectedCash / 10 ** scale).toFixed(scale)}
                />
              </label>
              <Button
                onClick={() => void submitCashierShift()}
                disabled={shiftBusy || !countedCash}
              >
                <Square size={16} /> Submit EOD
              </Button>
            </div>
          ) : (
            <div className="cashier-shift-controls">
              <label className="field">
                <span>Opening cash ({data.business.currency})</span>
                <input
                  type="number"
                  min="0"
                  step={1 / 10 ** scale}
                  value={openingCash}
                  onChange={(event) => setOpeningCash(event.target.value)}
                />
              </label>
              <Button
                onClick={() => void startCashierShift()}
                disabled={shiftBusy || shiftLoading}
              >
                <Play size={16} /> {shiftLoading ? "Loading shift…" : "Start shift"}
              </Button>
            </div>
          )}
        </section>
      )}
      <div className="pos-layout">
        <section className="pos-catalog">
          <label className="search pos-search">
            <Search size={19} />
            <input
              placeholder="Search product, SKU or scan a barcode…"
              aria-label="Search POS products"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && products.length === 1) {
                  update(products[0].id, products[0].variant_id, 1);
                  setSearch("");
                }
              }}
            />
            <span className="key-hint">↵</span>
          </label>
          <div className="category-pills">
            {["All", ...new Set(data.products.map((p) => p.category))].map(
              (c) => (
                <button
                  className={c === category ? "active" : ""}
                  disabled={busy || !cart.length || total < 0 || (data.user.role === "cashier" && (!cashierShift || shiftLoading))}
                  key={c}
                >
                  {c}
                </button>
              ),
            )}
          </div>
          {products.length ? (
            <div className="pos-products">
              {products.map((p) => (
                <button
                  key={`${p.id}:${p.variant_id || ""}`}
                  disabled={!p.stock}
                  onClick={() => update(p.id, p.variant_id, 1)}
                >
                  <div className="pos-product-image">
                    <ProductPhoto
                      src={p.image_url}
                      alt={`${p.name} product`}
                      className="pos-product-photo"
                    />
                    <span className="add-product">
                      <Plus size={16} />
                    </span>
                  </div>
                  <small>{p.category}</small>
                  <h3>{p.name}</h3>
                  <div>
                    <strong>{money(p.price)}</strong>
                    <small>{p.stock} available</small>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="panel">
              <Empty
                title={
                  search
                    ? "No matching products"
                    : "Ready when your shelves are"
                }
                description={
                  search
                    ? "Try a product name, SKU or barcode."
                    : "Add products and stock to start your first checkout."
                }
                action={
                  canManage && (
                    <Button variant="secondary" onClick={() => act("product")}>
                      <Plus size={16} />
                      Add product
                    </Button>
                  )
                }
              />
            </div>
          )}
        </section>
        <aside className="panel cart-panel">
          <div className="cart-heading">
            <div className="row">
              <ShoppingBag size={19} />
              <h3>Current sale</h3>
              <Badge>{cart.reduce((n, i) => n + i.quantity, 0)}</Badge>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={!cart.length}
              onClick={() => {
                setCart([]);
                key.current = crypto.randomUUID();
                setError("");
              }}
            >
              Clear
            </Button>
          </div>
          <label className="customer-select">
            <Users size={17} />
            <select
              aria-label="Sale customer"
              value={customer}
              onChange={(e) => {
                setCustomer(e.target.value);
                key.current = crypto.randomUUID();
              }}
            >
              <option value="">Walk-in customer</option>
              {data.parties
                .filter((p) => p.kind === "customer")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="cart-lines">
            {cart.length ? (
              cart.map((i) => {
                const p = sellableProducts.find(
                  (p) =>
                    p.id === i.product_id && p.variant_id === i.variant_id,
                )!;
                const lineTotal = multiplyMinor(p.price, i.quantity);
                return (
                  <div
                    className="cart-line"
                    key={`${i.product_id}:${i.variant_id || ""}`}
                  >
                    <span className="product-thumb">
                      <Package size={20} />
                    </span>
                    <div>
                      <strong>{p.name}</strong>
                      <small>{money(p.price)} / {p.unit}</small>
                      <div className="quantity-control">
                        <button
                          onClick={() => update(p.id, p.variant_id, -1)}
                          aria-label={"Remove one " + p.name}
                        >
                          <Minus size={12} />
                        </button>
                        <input
                          aria-label={`Quantity of ${p.name}`}
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={i.quantity}
                          onChange={(e) => {
                            if (e.target.value)
                              setQuantity(
                                p.id,
                                p.variant_id,
                                Number(e.target.value),
                              );
                          }}
                        />
                        <button
                          onClick={() => update(p.id, p.variant_id, 1)}
                          aria-label={"Add one " + p.name}
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                    <strong>{money(lineTotal)}</strong>
                  </div>
                );
              })
            ) : (
              <Empty
                title="A fresh start"
                description="Choose a product to start building your sale."
                icon={ShoppingBag}
              />
            )}
          </div>
          <div className="cart-summary">
            <div>
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>
            {canManage && (
              <>
                <label>
                  <span>Discount ({data.business.currency})</span>
                  <input
                    aria-label="Sale discount"
                    type="number"
                    min="0"
                    step={1 / 10 ** scale}
                    value={discount}
                    onChange={(e) => {
                      setDiscount(e.target.value);
                      key.current = crypto.randomUUID();
                    }}
                  />
                </label>
                <label>
                  <span>Tax rate (%)</span>
                  <input
                    aria-label="Tax rate percent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={tax}
                    onChange={(e) => {
                      setTax(e.target.value);
                      key.current = crypto.randomUUID();
                    }}
                  />
                </label>
              </>
            )}
            <div className="cart-total">
              <strong>Total</strong>
              <strong>{money(total)}</strong>
            </div>
            <div className="payment-methods">
              <button
                className={method === "cash" ? "active" : ""}
                onClick={() => {
                  setMethod("cash");
                  key.current = crypto.randomUUID();
                }}
              >
                <Wallet size={17} />
                Cash
              </button>
              {canManage && (
                <button
                  className={method === "credit" ? "active" : ""}
                  onClick={() => {
                    setMethod("credit");
                    key.current = crypto.randomUUID();
                  }}
                >
                  <Clock3 size={17} />
                  Customer credit
                </button>
              )}
            </div>
            {method === "cash" ? (
              <label className="field">
                <span>Cash received ({data.business.currency})</span>
                <input
                  type="number"
                  min="0"
                  step={1 / 10 ** scale}
                  value={cash}
                  placeholder={(total / 10 ** scale).toFixed(scale)}
                  onChange={(e) => {
                    setCash(e.target.value);
                    key.current = crypto.randomUUID();
                  }}
                />
              </label>
            ) : (
              <p className="subtle-note">
                Select a customer. This sale creates a receivable.
              </p>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <Button
              className="checkout-button"
              disabled={busy || !cart.length}
              onClick={async () => {
                setError("");
                setBusy(true);
                try {
                  const result = await write("/sales", {
                    branch_id: branch,
                    customer_id: customer || null,
                    items: cart,
                    expected_total: total,
                    discount: toMinor(discount, scale),
                    tax_bps: toMinor(tax, 2),
                    method,
                    tendered:
                      method === "cash"
                        ? toMinor(
                            cash || (total / 10 ** scale).toFixed(scale),
                            scale,
                          )
                        : 0,
                    idempotency: key.current,
                  });
                  setCart([]);
                  setCash("");
                  setDiscount("0");
                  key.current = crypto.randomUUID();
                  act("receipt", { id: result.id, change: result.change });
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <ShieldCheck size={17} />
              {busy ? "Completing sale…" : `Complete sale · ${money(total)}`}
              <ArrowRight size={17} />
            </Button>
            <small className="checkout-note">
              Stock updates only when checkout completes.
            </small>
          </div>
        </aside>
      </div>
    </>
  );
}

type RestaurantState = { tables: Row[]; stations: Row[]; orders: Row[] };
type DraftRestaurantItem = {
  product: string;
  quantity: string;
  station_id: string;
};
export function Restaurant() {
  const { data, branch, write, notify, money } = useWorkspace();
  const [service, setService] = useState<RestaurantState>({
    tables: [],
    stations: [],
    orders: [],
  });
  const [dialog, setDialog] = useState<"table" | "station" | "order" | null>(
    null,
  );
  const [orderTable, setOrderTable] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [stationFilter, setStationFilter] = useState("all");
  const [draft, setDraft] = useState<DraftRestaurantItem[]>([]);
  const [error, setError] = useState("");
  const menu = data.products.flatMap((p) => [
    { key: `${p.id}:`, product_id: p.id, name: p.name, sku: p.sku, price: p.price, stock: p.stock },
    ...(p.variants || []).map((v: Row) => ({
      key: `${p.id}:${v.id}`,
      product_id: p.id,
      variant_id: v.id,
      name: `${p.name} · ${v.name}`,
      sku: v.sku,
      price: v.price,
      stock: v.stock,
    })),
  ]);
  const reload = useCallback(async () => {
    try {
      const next = await api<RestaurantState>(
        `/restaurant?branch=${encodeURIComponent(branch)}`,
      );
      setService(next);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [branch]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const activeStatuses = ["open", "submitted", "preparing", "ready", "served"];
  const activeForTable = (tableId: string) =>
    service.orders.find(
      (order) =>
        order.table_id === tableId && activeStatuses.includes(order.status),
    );
  const selectedOrder = service.orders.find((o) => o.id === selectedOrderId);
  const startOrder = (tableId: string) => {
    setOrderTable(tableId);
    setDraft([
      {
        product: menu[0]?.key || "",
        quantity: "1",
        station_id: service.stations[0]?.id || "",
      },
    ]);
    setDialog("order");
  };
  const mutate = async (path: string, body: unknown = {}) => {
    setError("");
    try {
      await write(path, body);
      await reload();
      notify("Restaurant record updated.");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const advance = (orderId: string, item: Row) => {
    const status =
      item.status === "queued"
        ? "preparing"
        : item.status === "preparing"
          ? "ready"
          : "served";
    void mutate(
      `/restaurant/orders/${orderId}/items/${item.id}/status`,
      { status },
    );
  };
  const kitchenOrders = service.orders.filter((o) =>
    ["submitted", "preparing", "ready"].includes(o.status),
  );
  return (
    <>
      <PageTitle
        eyebrow="RESTAURANT & BAR"
        title="Tables & kitchen"
        description="Open table orders, route items to kitchen stations, and move each ticket through service."
        actions={
          <>
            <Button variant="secondary" onClick={() => setDialog("station")}>
              <Plus size={16} /> Add kitchen station
            </Button>
            <Button onClick={() => setDialog("table")}>
              <Plus size={16} /> Add table
            </Button>
          </>
        }
      />
      <div className="info-strip">
        <Utensils size={18} />
        Sending an order to the kitchen deducts its stock. Payment and sales
        accounting remain separate and must be completed in Point of sale.
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="section-label">
        <h2>Dining tables</h2>
        <Badge>{service.tables.length} active tables</Badge>
      </div>
      {service.tables.length ? (
        <div className="restaurant-tables">
          {service.tables.map((table) => {
            const order = activeForTable(table.id);
            return (
              <article className="restaurant-table panel" key={table.id}>
                <div className="row between">
                  <span className="square-icon"><Store size={18} /></span>
                  <Badge tone={order ? "amber" : "mint"}>
                    {order ? order.status : "Available"}
                  </Badge>
                </div>
                <h3>{table.name}</h3>
                <small className="muted">{table.seats} seats</small>
                {order ? (
                  <Button
                    variant="secondary"
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                    {order.reference} · View order
                  </Button>
                ) : (
                  <Button onClick={() => startOrder(table.id)}>
                    <Plus size={15} /> Start order
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel">
          <Empty
            title="Set up your first table"
            description="Create dining tables before opening restaurant orders."
            action={<Button onClick={() => setDialog("table")}>Add table</Button>}
            icon={Utensils}
          />
        </div>
      )}
      {selectedOrder && (
        <section className="panel restaurant-order-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{selectedOrder.table_name}</span>
              <h2>{selectedOrder.reference}</h2>
              <p>{selectedOrder.notes || "No order notes"} · {selectedOrder.status}</p>
            </div>
            <Button variant="ghost" onClick={() => setSelectedOrderId("")}>
              Close details
            </Button>
          </div>
          <div className="restaurant-order-items">
            {selectedOrder.items.map((item: Row) => (
              <div className="restaurant-order-item" key={item.id}>
                <div>
                  <strong>{item.quantity} × {item.name}</strong>
                  <small>
                    {item.station_name || "No kitchen station"} · {money(multiplyMinor(item.price, item.quantity))}
                  </small>
                </div>
                <Badge tone={item.status === "served" ? "mint" : "neutral"}>
                  {item.status}
                </Badge>
              </div>
            ))}
          </div>
          <div className="row wrap">
            {selectedOrder.status === "open" && (
              <>
                <Button
                  onClick={() =>
                    void mutate(`/restaurant/orders/${selectedOrder.id}/submit`)
                  }
                >
                  Send order to kitchen
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    void mutate(`/restaurant/orders/${selectedOrder.id}/cancel`)
                  }
                >
                  Cancel unsent order
                </Button>
              </>
            )}
            {selectedOrder.status === "served" && (
              <Button
                onClick={() =>
                  void mutate(`/restaurant/orders/${selectedOrder.id}/close`)
                }
              >
                Close table order
              </Button>
            )}
          </div>
        </section>
      )}
      <div className="section-label">
        <h2>Kitchen tickets</h2>
        <label className="branch-select">
          <select
            aria-label="Filter kitchen station"
            value={stationFilter}
            onChange={(e) => setStationFilter(e.target.value)}
          >
            <option value="all">All stations</option>
            {service.stations.map((station) => (
              <option key={station.id} value={station.id}>{station.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="panel kitchen-tickets">
        {kitchenOrders.flatMap((order) =>
          order.items
            .filter(
              (item: Row) =>
                item.status !== "served" &&
                (stationFilter === "all" || item.station_id === stationFilter),
            )
            .map((item: Row) => (
              <div className="kitchen-ticket" key={item.id}>
                <div>
                  <span className="eyebrow">{order.reference} · {order.table_name}</span>
                  <strong>{item.quantity} × {item.name}</strong>
                  <small>{item.station_name || "Unassigned station"} · {item.status}</small>
                </div>
                <Button
                  size="sm"
                  onClick={() => advance(order.id, item)}
                >
                  {item.status === "queued"
                    ? "Start preparing"
                    : item.status === "preparing"
                      ? "Mark ready"
                      : "Mark served"}
                  <ArrowRight size={14} />
                </Button>
              </div>
            )),
        )}
        {!kitchenOrders.some((order) =>
          order.items.some(
            (item: Row) =>
              item.status !== "served" &&
              (stationFilter === "all" || item.station_id === stationFilter),
          ),
        ) && (
          <Empty
            title="Kitchen is clear"
            description="Submitted restaurant orders appear here, routed by station."
            icon={Utensils}
          />
        )}
      </div>
      {dialog === "table" && (
        <Modal title="Add dining table" onClose={() => setDialog(null)}>
          <Form
            onSubmit={async (form) => {
              await write("/restaurant/tables", {
                branch_id: branch,
                name: form.get("name"),
                seats: Number(form.get("seats")),
              });
              await reload();
              notify("Dining table created.");
              setDialog(null);
            }}
            submit="Create table"
          >
            <Fields
              fields={[
                { name: "name", label: "Table name or number" },
                { name: "seats", label: "Seats", type: "number", min: 1, value: 2 },
              ]}
            />
          </Form>
        </Modal>
      )}
      {dialog === "station" && (
        <Modal title="Add kitchen station" onClose={() => setDialog(null)}>
          <Form
            onSubmit={async (form) => {
              await write("/restaurant/stations", {
                branch_id: branch,
                name: form.get("name"),
              });
              await reload();
              notify("Kitchen station created.");
              setDialog(null);
            }}
            submit="Create station"
          >
            <Fields fields={[{ name: "name", label: "Station name" }]} />
          </Form>
        </Modal>
      )}
      {dialog === "order" && (
        <Modal
          title={`New order · ${service.tables.find((t) => t.id === orderTable)?.name || ""}`}
          description="Choose products, quantities and kitchen stations before sending the ticket."
          onClose={() => setDialog(null)}
        >
          {!menu.length ? (
            <div className="warning-strip">
              Add products and stock in Inventory before taking a table order.
            </div>
          ) : (
            <Form
              onSubmit={async (form) => {
                const items = draft.map((line) => {
                  const selected = menu.find((m) => m.key === line.product);
                  if (!selected) throw new Error("Choose a menu product for every line.");
                  return {
                    product_id: selected.product_id,
                    ...(selected.variant_id ? { variant_id: selected.variant_id } : {}),
                    station_id: line.station_id || null,
                    quantity: Number(line.quantity),
                  };
                });
                const result = await write("/restaurant/orders", {
                  branch_id: branch,
                  table_id: orderTable,
                  notes: form.get("notes"),
                  items,
                });
                await reload();
                setSelectedOrderId(result.id);
                notify("Table order opened. Send it to the kitchen when ready.");
                setDialog(null);
              }}
              submit="Open table order"
            >
              <div className="restaurant-draft">
                {draft.map((line, index) => (
                  <div className="restaurant-draft-line" key={index}>
                    <label className="field">
                      <span>Product</span>
                      <select
                        value={line.product}
                        onChange={(e) =>
                          setDraft((items) =>
                            items.map((item, i) =>
                              i === index ? { ...item, product: e.target.value } : item,
                            ),
                          )
                        }
                        required
                      >
                        {menu.map((item) => (
                          <option key={item.key} value={item.key}>
                            {item.name} · {item.stock} available
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Quantity</span>
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={line.quantity}
                        onChange={(e) =>
                          setDraft((items) =>
                            items.map((item, i) =>
                              i === index ? { ...item, quantity: e.target.value } : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Kitchen station</span>
                      <select
                        value={line.station_id}
                        onChange={(e) =>
                          setDraft((items) =>
                            items.map((item, i) =>
                              i === index ? { ...item, station_id: e.target.value } : item,
                            ),
                          )
                        }
                      >
                        <option value="">Unassigned</option>
                        {service.stations.map((station) => (
                          <option key={station.id} value={station.id}>{station.name}</option>
                        ))}
                      </select>
                    </label>
                    {draft.length > 1 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remove order line"
                        onClick={() =>
                          setDraft((items) => items.filter((_, i) => i !== index))
                        }
                      >
                        <Minus size={15} />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setDraft((items) => [
                      ...items,
                      {
                        product: menu[0]?.key || "",
                        quantity: "1",
                        station_id: service.stations[0]?.id || "",
                      },
                    ])
                  }
                >
                  <Plus size={15} /> Add order item
                </Button>
                <label className="field">
                  <span>Order notes <small>Optional</small></span>
                  <textarea name="notes" maxLength={500} />
                </label>
              </div>
            </Form>
          )}
        </Modal>
      )}
    </>
  );
}

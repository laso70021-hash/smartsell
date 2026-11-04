import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  Link,
  useLocation,
} from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  BarChart3,
  Users,
  TriangleAlert,
  Store,
  ShoppingCart,
  ClipboardCheck,
  FileCheck2,
  Contact,
  Truck,
  ReceiptText,
  History,
  Download,
  Settings,
  LogOut,
  Bell,
  Sun,
  Moon,
  Menu,
  X,
  ChevronDown,
  ArrowUpRight,
  Utensils,
  MessageCircle,
} from "lucide-react";
import {
  api,
  platformAdminOperations,
  platformAdminRequest,
  platformBillingRequest,
  type PlatformBilling,
  type PlatformAdminOperations,
  type PlatformAdminOverview,
  type PlatformAdminRange,
  type User,
  type Workspace,
  type Row,
  currencyScale,
} from "./lib/api";
import { getSupabase } from "./lib/supabase";
import { Logo } from "./components/shared";
import { Button } from "./components/ui/button";
import { Auth, Landing } from "./components/public";
import {
  Dashboard,
  Inventory,
  Records,
  Reports,
  CashierEodReports,
  Restaurant,
  SettingsPage,
  Transactions,
  POS,
} from "./components/pages";
import { ActionDialog } from "./components/actions";
import { DocumentTemplates } from "./components/documents";
import {
  BusinessAccountsPage,
  PlatformAdminConsolePage,
  WorkspaceSupportPage,
} from "./components/platform-console";
const SYSTEM_ADMIN_ID = "0706ee20-d730-4a3e-bfaf-db0547cb3da5";
const isSystemAdminUser = (user: User) =>
  Boolean(user.is_admin) || user.id === SYSTEM_ADMIN_ID;

type Action = { type: string; record?: Row };
type Context = {
  data: Workspace;
  branch: string;
  refresh: () => Promise<Workspace>;
  money: (n: number) => string;
  scale: number;
  act: (type: string, record?: Row) => void;
  notify: (s: string) => void;
  write: (path: string, body?: unknown, method?: string) => Promise<any>;
  canManage: boolean;
  setTheme: (s: "dark" | "light") => void;
};
const WorkContext = createContext<Context | null>(null);
export function useWorkspace() {
  const ctx = useContext(WorkContext);
  if (!ctx) throw new Error("Workspace provider missing");
  return ctx;
}
const links = [
  {
    to: "/app",
    label: "Overview",
    icon: LayoutDashboard,
    section: "WORKSPACE",
  },
  { to: "/app/inventory", label: "Inventory", icon: Package },
  { to: "/app/sales", label: "Sales", icon: ReceiptText },
  { to: "/app/reports", label: "Reports", icon: BarChart3 },
  { to: "/app/reports/eod", label: "Cashier EOD Reports", icon: ClipboardCheck },
  { to: "/app/stock-alerts", label: "Stock alerts", icon: TriangleAlert },
  {
    to: "/app/customers",
    label: "Customers",
    icon: Contact,
    section: "MANAGEMENT",
  },
  { to: "/app/suppliers", label: "Suppliers", icon: Truck },
  { to: "/app/purchases", label: "Purchases", icon: ShoppingCart },
  { to: "/app/expenses", label: "Expenses", icon: ReceiptText },
  { to: "/app/restaurant", label: "Restaurant", icon: Utensils },
  { to: "/app/staff", label: "Team", icon: Users, owner: true },
  { to: "/app/branches", label: "Branches", icon: Store },
  {
    to: "/app/transactions",
    label: "Transactions",
    icon: History,
    section: "BUSINESS",
  },
  { to: "/app/support", label: "Support", icon: MessageCircle },
  { to: "/app/downloads", label: "Downloads", icon: Download },
  { to: "/app/settings", label: "Settings", icon: Settings, owner: true },
];
function AdminConsole({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [overview, setOverview] = useState<PlatformAdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [range, setRange] = useState<PlatformAdminRange>("30d");
  const [theme, setTheme] = useState<"dark" | "light">(user.theme || "dark");
  const [operation, setOperation] = useState<PlatformAdminOperations | null>(null);
  const [operationLoading, setOperationLoading] = useState(false);
  const [operationError, setOperationError] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [operationSearch, setOperationSearch] = useState("");
  const [billing, setBilling] = useState<PlatformBilling | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [billingStatus, setBillingStatus] = useState("");
  const [editingPlanId, setEditingPlanId] = useState("");
  const [planDraft, setPlanDraft] = useState({
    name: "",
    description: "",
    amount: "",
    currency: "TZS",
    billing_interval: "month" as "month" | "year",
    trial_days: "0",
  });
  const [subscriptionDraft, setSubscriptionDraft] = useState({
    business_id: "",
    plan_id: "",
    amount: "",
    currency: "",
  });
  const [paymentDraft, setPaymentDraft] = useState({
    subscription_id: "",
    amount: "",
    currency: "",
    method: "manual",
    status: "pending",
    external_reference: "",
    note: "",
  });
  const location = useLocation();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await platformAdminRequest<PlatformAdminOverview>("overview", {
        range,
      });
      setOverview(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load platform data.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadBilling = useCallback(async () => {
    setBillingLoading(true);
    try {
      const result = await platformBillingRequest<PlatformBilling>("list", {
        range,
      });
      setBilling(result);
      setBillingError("");
      setSubscriptionDraft((current) => ({
        ...current,
        business_id: current.business_id || result.businesses[0]?.id || "",
        plan_id: current.plan_id || result.plans.find((plan) => plan.active)?.id || "",
      }));
      setPaymentDraft((current) => {
        const selected = result.subscriptions.find(
          (subscription) => subscription.id === current.subscription_id,
        ) || result.subscriptions.find((subscription) =>
          ["trialing", "active", "past_due"].includes(subscription.status),
        );
        return {
          ...current,
          subscription_id: selected?.id || "",
          currency: current.currency || selected?.currency || "",
          amount: current.amount || (selected
            ? String(Number(selected.amount) / 10 ** currencyScale(selected.currency))
            : ""),
        };
      });
    } catch (e) {
      setBillingError(
        e instanceof Error ? e.message : "Unable to load subscription billing.",
      );
    } finally {
      setBillingLoading(false);
    }
  }, [range]);

  useEffect(() => {
    if (location.pathname === "/admin/subscriptions") void loadBilling();
  }, [location.pathname, loadBilling]);

  useEffect(() => {
    if (location.pathname !== "/admin") return;
    let active = true;
    void platformBillingRequest<PlatformBilling>("list", { range })
      .then((result) => {
        if (active) setBilling(result);
      })
      .catch((e) => {
        if (active)
          setBillingError(
            e instanceof Error ? e.message : "Unable to load subscription revenue.",
          );
      });
    return () => {
      active = false;
    };
  }, [location.pathname, range]);

  const runBillingAction = async (
    action: string,
    body: Record<string, unknown>,
    message: string,
  ) => {
    setBillingBusy(true);
    setBillingError("");
    setBillingStatus("");
    try {
      await platformBillingRequest(action, { body });
      setBillingStatus(message);
      await loadBilling();
      return true;
    } catch (e) {
      setBillingError(
        e instanceof Error ? e.message : "Unable to update billing records.",
      );
      return false;
    } finally {
      setBillingBusy(false);
    }
  };

  const operationActions: Record<string, string> = {
    "/admin/inventory": "inventory",
    "/admin/sales": "sales",
    "/admin/transactions": "transactions",
    "/admin/reports": "analytics",
    "/admin/audit-logs": "audit_logs",
  };
  const operationAction = operationActions[location.pathname] || "";
  useEffect(() => {
    if (!operationAction) {
      setOperation(null);
      setOperationError("");
      return;
    }

    let cancelled = false;
    setOperationLoading(true);
    setOperationError("");
    const timer = window.setTimeout(() => {
      void platformAdminOperations<PlatformAdminOperations>(operationAction, {
        range,
        body: { search: operationSearch.trim() },
      })
        .then((result) => {
          if (!cancelled) setOperation(result);
        })
        .catch((e) => {
          if (!cancelled)
            setOperationError(
              e instanceof Error ? e.message : "Unable to load platform records.",
            );
        })
        .finally(() => {
          if (!cancelled) setOperationLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [operationAction, operationSearch, range]);

  const toggleUser = async (targetId: string) => {
    try {
      const result = await platformAdminRequest<{ ok: boolean; active: number }>(
        "toggle_user",
        { body: { user_id: targetId } },
      );
      setStatus(
        result.active ? "User access reactivated." : "User access suspended.",
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update user access.");
    }
  };

  const toggleTheme = async () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    try {
      await api("/profile", { name: user.name, theme: nextTheme }, "PUT");
      document.documentElement.dataset.theme = nextTheme;
      setTheme(nextTheme);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update theme.");
    }
  };

  const moneyByCurrency = (
    rows: Array<{ currency: string; total?: number; value?: number }>,
    field: "total" | "value",
  ) =>
    rows.length
      ? rows
          .map(({ currency, total, value }) => {
            const scale = currencyScale(currency);
            return new Intl.NumberFormat("en", {
              style: "currency",
              currency,
              minimumFractionDigits: scale,
              maximumFractionDigits: scale,
            }).format(Number(field === "total" ? total : value) / 10 ** scale);
          })
          .join(" · ")
      : "No recorded activity";

  const currentPage =
    location.pathname === "/admin"
      ? "Overview"
      : location.pathname.split("/").filter(Boolean).at(-1) || "Overview";
  const pageTitle = ({
    Overview: "Overview",
    users: "Users",
    businesses: "Businesses",
    branches: "Branches",
    inventory: "Inventory Oversight",
    sales: "Sales Oversight",
    transactions: "Transactions",
    reports: "Reports & Analytics",
    "audit-logs": "Audit Logs",
    subscriptions: "Subscriptions & Billing",
    approvals: "Approvals",
    "restaurant-pos": "Restaurant & POS",
    support: "Support",
    settings: "Settings",
  }[currentPage] || currentPage.charAt(0).toUpperCase() + currentPage.slice(1));

  const data = overview;
  const isInitialLoad = loading && !data;
  const rangeLabels: Record<PlatformAdminRange, string> = {
    today: "Today",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    month: "This month",
  };
  const operationToolbar = (
    count?: number,
    noun = "records",
    searchable = true,
  ) => (
    <div className="admin-ops-toolbar">
      {searchable && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setOperationSearch(searchDraft);
          }}
        >
          <label className="sr-only" htmlFor="admin-record-search">Search platform records</label>
          <input
            id="admin-record-search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search platform records"
          />
          <Button type="submit" variant="secondary" disabled={operationLoading}>
            Search
          </Button>
        </form>
      )}
      <label className="admin-range-control">
        <span>Date range</span>
        <select
          aria-label="Admin data date range"
          value={range}
          onChange={(event) => setRange(event.target.value as PlatformAdminRange)}
        >
          {Object.entries(rangeLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      {count !== undefined && (
        <span className="admin-record-count">
          {count.toLocaleString()} {noun}
        </span>
      )}
      {operationLoading && <span className="admin-loading-note">Refreshing…</span>}
    </div>
  );

  if (isInitialLoad)
    return (
      <div className="app-loading">
        <Logo />
        <div className="loading-line" />
        <p>Loading platform administration…</p>
      </div>
    );

  if (!data)
    return (
      <div className="app-loading">
        <Logo />
        <div className="error" role="alert">{error || "Platform data is unavailable."}</div>
        <Button onClick={() => void refresh()}>Retry</Button>
        <Button variant="ghost" onClick={onLogout}>Sign out</Button>
      </div>
    );

  const categoryColors = ["#42d4c2", "#5ec5ff", "#ffb968", "#8d7dff", "#ff8aa1", "#4ed6b4"];
  const categoryTotal = data.business_types.reduce((sum, item) => sum + item.count, 0);
  let categoryEnd = 0;
  const categoryGradient = data.business_types.length
    ? `conic-gradient(${data.business_types.map((item, index) => {
        const start = categoryEnd;
        categoryEnd += categoryTotal ? (item.count / categoryTotal) * 100 : 0;
        return `${categoryColors[index % categoryColors.length]} ${start}% ${categoryEnd}%`;
      }).join(", ")})`
    : "conic-gradient(var(--border) 0% 100%)";
  const growthValues = data.growth.map((point) => point.count);
  const growthMinimum = growthValues.length ? Math.min(...growthValues) : 0;
  const growthMaximum = growthValues.length ? Math.max(...growthValues) : 0;
  const growthPadding = Math.max((growthMaximum - growthMinimum) * 0.08, 1);
  const rawGrowthStep =
    (growthMaximum - growthMinimum + growthPadding * 2) / 3;
  const growthStepMagnitude = 10 ** Math.floor(Math.log10(Math.max(rawGrowthStep, 1)));
  const normalizedGrowthStep = rawGrowthStep / growthStepMagnitude;
  const growthStep =
    (normalizedGrowthStep <= 1
      ? 1
      : normalizedGrowthStep <= 2
        ? 2
        : normalizedGrowthStep <= 5
          ? 5
          : 10) * growthStepMagnitude;
  const growthAxisMinimum = Math.max(
    0,
    Math.floor((growthMinimum - growthPadding) / growthStep) * growthStep,
  );
  let growthAxisMaximum =
    Math.ceil((growthMaximum + growthPadding) / growthStep) * growthStep;
  while ((growthAxisMaximum - growthAxisMinimum) / growthStep < 3) {
    growthAxisMaximum += growthStep;
  }
  const growthChart = {
    width: 640,
    height: 190,
    left: 44,
    right: 12,
    top: 10,
    bottom: 30,
  };
  const growthPlotWidth =
    growthChart.width - growthChart.left - growthChart.right;
  const growthPlotHeight =
    growthChart.height - growthChart.top - growthChart.bottom;
  const growthY = (value: number) =>
    growthChart.top +
    ((growthAxisMaximum - value) / (growthAxisMaximum - growthAxisMinimum)) *
      growthPlotHeight;
  const growthCoordinates = data.growth.map((point, index) => ({
    ...point,
    x:
      growthChart.left +
      (data.growth.length > 1
        ? (index / (data.growth.length - 1)) * growthPlotWidth
        : growthPlotWidth / 2),
    y: growthY(point.count),
  }));
  const growthLinePath = growthCoordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const growthAreaPath = growthCoordinates.length
    ? `${growthLinePath} L ${growthCoordinates[growthCoordinates.length - 1].x} ${growthChart.top + growthPlotHeight} L ${growthCoordinates[0].x} ${growthChart.top + growthPlotHeight} Z`
    : "";
  const growthAxisTicks = Array.from(
    {
      length:
        Math.round((growthAxisMaximum - growthAxisMinimum) / growthStep) + 1,
    },
    (_, index) => growthAxisMinimum + growthStep * index,
  );
  const growthLabelCount = Math.min(data.growth.length, 8);
  const growthLabelIndexes = Array.from(
    { length: growthLabelCount },
    (_, index) =>
      growthLabelCount > 1
        ? Math.round((index * (data.growth.length - 1)) / (growthLabelCount - 1))
        : 0,
  );

  return (
    <div className="app-shell admin-shell">
      <aside className="sidebar admin-sidebar">
        <Link to="/admin" className="sidebar-brand">
          <Logo />
          <span className="brand-caption">PLATFORM ADMIN</span>
        </Link>
        <div className="business-switch">
          <span className="business-icon"><Store size={19} /></span>
          <div>
            <strong>{user.name}</strong>
            <small>Platform admin</small>
          </div>
        </div>
        <nav aria-label="Admin navigation">
          <NavLink to="/admin" end className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <LayoutDashboard size={18} />
            <span>Overview</span>
          </NavLink>
          <NavLink to="/admin/businesses" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <Store size={18} />
            <span>Businesses</span>
          </NavLink>
          <NavLink to="/admin/users" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <Users size={18} />
            <span>Users</span>
          </NavLink>
          <NavLink to="/admin/branches" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <Store size={18} />
            <span>Branches</span>
          </NavLink>
          <NavLink to="/admin/approvals" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <FileCheck2 size={18} />
            <span>Approvals</span>
          </NavLink>
          <NavLink to="/admin/subscriptions" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <ReceiptText size={18} />
            <span>Subscriptions &amp; Billing</span>
          </NavLink>
          <NavLink to="/admin/inventory" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <Package size={18} />
            <span>Inventory Oversight</span>
          </NavLink>
          <NavLink to="/admin/sales" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <ReceiptText size={18} />
            <span>Sales Oversight</span>
          </NavLink>
          <NavLink to="/admin/transactions" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <History size={18} />
            <span>Transactions</span>
          </NavLink>
          <NavLink to="/admin/restaurant-pos" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <Utensils size={18} />
            <span>Restaurant &amp; POS</span>
          </NavLink>
          <NavLink to="/admin/reports" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <BarChart3 size={18} />
            <span>Reports &amp; Analytics</span>
          </NavLink>
          <NavLink to="/admin/audit-logs" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <ClipboardCheck size={18} />
            <span>Audit Logs</span>
          </NavLink>
          <NavLink to="/admin/support" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <MessageCircle size={18} />
            <span>Support</span>
          </NavLink>
          <NavLink to="/admin/settings" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <Settings size={18} />
            <span>Settings</span>
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <button className="logout" onClick={onLogout}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="row">
            <span className="breadcrumb">Platform admin <span>/</span> <strong>{pageTitle}</strong></span>
          </div>
          <div className="topbar-actions">
            <Button variant="ghost" size="icon" aria-label="Refresh admin console" disabled={loading} onClick={() => void refresh()}>
              <Bell size={18} />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} onClick={() => void toggleTheme()}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
            <Button className="admin-workspace-button" asChild>
              <Link to="/app">Go to workspace <ArrowUpRight size={15} /></Link>
            </Button>
          </div>
        </header>
        <main className="main-content">
          {error && <div className="error" role="alert">{error}</div>}
          {status && <div className="success" role="status">{status}</div>}
          {operationError && <div className="error" role="alert">{operationError}</div>}
          {(location.pathname === "/admin/subscriptions" || location.pathname === "/admin") && billingError && (
            <div className="error" role="alert">{billingError}</div>
          )}
          {location.pathname === "/admin/subscriptions" && billingStatus && (
            <div className="success" role="status">{billingStatus}</div>
          )}
          <Routes>
            <Route
              index
              element={
                <div className="admin-overview">
                  <header className="admin-hero">
                    <div>
                      <div className="eyebrow">Platform overview</div>
                      <h1>Welcome back, {user.name || "Admin"}</h1>
                      <p>Here&apos;s what&apos;s happening across the Swahivo SmartSell platform today.</p>
                    </div>
                    <label className="pill-button range-picker">
                      <span className="sr-only">Dashboard date range</span>
                      <select
                        aria-label="Dashboard date range"
                        value={range}
                        onChange={(event) => setRange(event.target.value as PlatformAdminRange)}
                      >
                        {Object.entries(rangeLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                  </header>

                  <div className="stat-grid">
                    {[
                      { label: "Total businesses", value: data.stats.businesses, hint: "Registered businesses", icon: Store, tone: "businesses" },
                      { label: "Total users", value: data.stats.users, hint: "Business member accounts", icon: Users, tone: "users" },
                      { label: "Active accounts", value: data.stats.active, hint: "Currently enabled", icon: ClipboardCheck, tone: "active" },
                      { label: "Suspended accounts", value: data.stats.suspended, hint: "Currently disabled", icon: TriangleAlert, tone: "suspended" },
                      { label: "Total branches", value: data.stats.branches, hint: "Active branches", icon: Store, tone: "branches" },
                      {
                        label: "Platform revenue",
                        value: billing?.summary.paid_by_currency.length
                          ? billing.summary.paid_by_currency.map((item) =>
                              moneyByCurrency([{ currency: item.currency, total: item.total }], "total"),
                            ).join(" · ")
                          : "No recorded payments",
                        hint: `Manually verified collections · ${rangeLabels[range].toLowerCase()}`,
                        icon: ReceiptText,
                        tone: "revenue",
                      },
                    ].map((item) => (
                      <div key={item.label} className={`metric-card metric-card-${item.tone}`}>
                        <span className="metric-icon" aria-hidden="true">
                          <item.icon size={18} />
                        </span>
                        <div className="metric-copy">
                          <span className="metric-label">{item.label}</span>
                          <strong className="metric-value">{item.value}</strong>
                          <small className="metric-trend">{item.hint}</small>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="admin-showcase">
                    <section className="feature-panel">
                      <div className="feature-copy">
                        <div className="eyebrow">Growing ecosystem</div>
                        <h2>A thriving network of businesses.</h2>
                        <p>Registered businesses across the industries currently using Swahivo SmartSell.</p>
                        <div className="feature-actions">
                          <Link to="/admin/businesses">Manage businesses</Link>
                          <Link to="/admin/sales" className="secondary">View recent sales</Link>
                        </div>
                      </div>
                      <div className="feature-badge-wrap" aria-hidden="true">
                        <div className="feature-badge item-a">S</div>
                        <div className="feature-badge item-b"><Package size={18} /></div>
                        <div className="feature-badge item-c"><ShoppingCart size={18} /></div>
                        <div className="feature-badge item-d"><Utensils size={18} /></div>
                      </div>
                    </section>
                    <div className="mini-stat-stack">
                      <div className="mini-stat-card">
                        <span>Total stock value</span>
                        <strong>{moneyByCurrency(data.stats.stock_value_by_currency, "value")}</strong>
                        <small>Inventory cost · active branches</small>
                      </div>
                      <div className="mini-stat-card">
                        <span>Sales in {rangeLabels[range].toLowerCase()}</span>
                        <strong>{moneyByCurrency(data.stats.sales_by_currency, "total")}</strong>
                        <small>Business sales · by currency</small>
                      </div>
                      <div className="mini-stat-card">
                        <span>Low-stock locations</span>
                        <strong>{data.stats.low_stock.toLocaleString()}</strong>
                        <small>Branch low-stock alerts</small>
                      </div>
                      <div className="mini-stat-card">
                        <span>Total products</span>
                        <strong>{data.stats.products.toLocaleString()}</strong>
                        <small>Active catalog products</small>
                      </div>
                    </div>
                  </div>

                  <div className="admin-lower-grid">
                    <section className="panel admin-panel chart-panel">
                      <div className="panel-heading compact-head">
                        <div>
                          <h3>Business growth</h3>
                          <p>Cumulative registered businesses · {rangeLabels[range].toLowerCase()}</p>
                        </div>
                        <span className="mini-select">{data.stats.businesses} businesses</span>
                      </div>
                      {growthCoordinates.length ? (
                        <svg
                          className="growth-chart"
                          viewBox={`0 0 ${growthChart.width} ${growthChart.height}`}
                          role="img"
                          aria-labelledby="growth-chart-title growth-chart-description"
                          preserveAspectRatio="none"
                        >
                          <title id="growth-chart-title">Business growth</title>
                          <desc id="growth-chart-description">
                            Cumulative registered businesses over the selected date range.
                          </desc>
                          <defs>
                            <linearGradient id="growth-area-fill" x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0%" stopColor="#20d9ae" stopOpacity="0.3" />
                              <stop offset="100%" stopColor="#20d9ae" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          {growthAxisTicks.map((tick) => {
                            const y = growthY(tick);
                            return (
                              <g key={tick}>
                                <line
                                  x1={growthChart.left}
                                  x2={growthChart.width - growthChart.right}
                                  y1={y}
                                  y2={y}
                                  className="growth-gridline"
                                />
                                <text
                                  x={growthChart.left - 10}
                                  y={y + 4}
                                  textAnchor="end"
                                  className="growth-axis-label"
                                >
                                  {Math.round(tick).toLocaleString()}
                                </text>
                              </g>
                            );
                          })}
                          <path d={growthAreaPath} fill="url(#growth-area-fill)" />
                          <path d={growthLinePath} className="growth-line" />
                          {growthCoordinates.map((point) => (
                            <circle
                              key={point.date}
                              cx={point.x}
                              cy={point.y}
                              r="2"
                              className="growth-point"
                            >
                              <title>
                                {point.date}: {point.count.toLocaleString()} businesses
                              </title>
                            </circle>
                          ))}
                          {growthCoordinates.length > 0 && (
                            <circle
                              cx={growthCoordinates[growthCoordinates.length - 1].x}
                              cy={growthCoordinates[growthCoordinates.length - 1].y}
                              r="4"
                              className="growth-current-point"
                            />
                          )}
                          {growthLabelIndexes.map((index) => {
                            const point = growthCoordinates[index];
                            const date = new Date(`${point.date}T00:00:00`);
                            return (
                              <text
                                key={point.date}
                                x={point.x}
                                y={growthChart.height - 8}
                                textAnchor={
                                  index === 0
                                    ? "start"
                                    : index === growthCoordinates.length - 1
                                      ? "end"
                                      : "middle"
                                }
                                className="growth-axis-label"
                              >
                                {date.toLocaleDateString("en", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </text>
                            );
                          })}
                        </svg>
                      ) : (
                        <div className="growth-chart-empty">No business growth data for this period.</div>
                      )}
                    </section>

                    <section className="panel admin-panel breakdown-panel">
                      <div className="panel-heading compact-head">
                        <div>
                          <h3>Business types breakdown</h3>
                          <p>Businesses by type on the platform</p>
                        </div>
                      </div>
                      <div className="donut-wrap">
                        <div className="donut-chart" aria-label="Business type distribution" style={{ background: categoryGradient }}>
                          <span className="donut-center">{categoryTotal.toLocaleString()}</span>
                        </div>
                        <ul className="legend-list">
                          {data.business_types.map((item, index) => (
                            <li key={item.type}>
                              <span className="legend-swatch" style={{ background: categoryColors[index % categoryColors.length] }} />
                              <span>{item.type}</span>
                              <strong>{categoryTotal ? `${((item.count / categoryTotal) * 100).toFixed(1)}%` : "0%"}</strong>
                              <small>{item.count}</small>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </section>

                    <section className="panel admin-panel activity-panel">
                      <div className="panel-heading compact-head">
                        <div>
                          <h3>Recent platform activity</h3>
                        </div>
                        <Link className="text-link" to="/admin/audit-logs">View all</Link>
                      </div>
                      <ul className="activity-list">
                      {data.recent.slice(0, 4).map((row) => (
                        <li key={row.id}>
                          <span className="activity-bullet">•</span>
                          <div>
                            <strong>{row.entity || row.category || "Platform activity"}</strong>
                            <small>{row.business_name} · {row.description}</small>
                          </div>
                        </li>
                      ))}
                      {!data.recent.length && <li><span>No activity recorded yet.</span></li>}
                      </ul>
                    </section>

                    <section className="panel admin-panel quick-panel">
                      <div className="panel-heading compact-head">
                        <div>
                          <h3>Quick actions &amp; moderation</h3>
                          <p>Common platform administration tasks</p>
                        </div>
                      </div>
                      <ul className="quick-list">
                        <li>
                          <ReceiptText size={17} />
                          <Link to="/admin/subscriptions">Subscriptions &amp; billing</Link>
                          <strong>{billing?.summary.subscribers ?? "—"}</strong>
                        </li>
                        <li>
                          <TriangleAlert size={17} />
                          <Link to="/admin/inventory">Resolve low-stock alerts</Link>
                          <strong>{data.stats.low_stock}</strong>
                        </li>
                        <li>
                          <Store size={17} />
                          <Link to="/admin/businesses">Review businesses</Link>
                          <strong>{data.stats.businesses}</strong>
                        </li>
                        <li>
                          <History size={17} />
                          <Link to="/admin/audit-logs">Review platform activity</Link>
                          <strong>{data.recent.length}</strong>
                        </li>
                      </ul>
                    </section>

                    <section className="panel admin-panel quick-panel">
                      <div className="panel-heading compact-head">
                        <div>
                          <h3>Latest businesses</h3>
                          <p>Most recently registered tenants</p>
                        </div>
                        <Link className="text-link" to="/admin/businesses">View all</Link>
                      </div>
                      <ul className="activity-list">
                        {data.businesses.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4).map((business) => (
                          <li key={business.id}>
                            <span className="activity-bullet">•</span>
                            <div>
                              <strong>{business.name}</strong>
                              <small>{business.category} · {business.country} · {business.member_count} members</small>
                            </div>
                          </li>
                        ))}
                        {!data.businesses.length && <li><span>No businesses registered yet.</span></li>}
                      </ul>
                    </section>

                    <section className="panel admin-panel activity-panel">
                      <div className="panel-heading compact-head">
                        <div>
                          <h3>Recent sales</h3>
                          <p>Business transactions · {rangeLabels[range].toLowerCase()}</p>
                        </div>
                        <Link className="text-link" to="/admin/sales">View recent sales</Link>
                      </div>
                      <ul className="activity-list">
                        {data.recent_sales.slice(0, 4).map((sale) => (
                          <li key={sale.id}>
                            <span className="activity-bullet">•</span>
                            <div>
                              <strong>{sale.business_name} · {sale.reference}</strong>
                              <small>{moneyByCurrency([{ currency: sale.currency, total: sale.total }], "total")} · {sale.status} · {new Date(sale.created_at).toLocaleString()}</small>
                            </div>
                          </li>
                        ))}
                        {!data.recent_sales.length && <li><span>No sales recorded in this date range.</span></li>}
                      </ul>
                    </section>
                  </div>
                </div>
              }
            />
            <Route
              path="users"
              element={
                <section className="panel table-panel">
                  <div className="panel-header">
                    <h3>System users</h3>
                    <span>{data.users.length} members</span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Business</th>
                          <th>Role</th>
                          <th>Branch</th>
                          <th>Registered</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.users.length ? data.users.map((member) => {
                          const active = member.active === 1;
                          return (
                            <tr key={member.id}>
                              <td>{member.name}<div className="muted">{member.email}</div></td>
                              <td>{member.business_name}</td>
                              <td>{member.role}</td>
                              <td>{member.branch_name}</td>
                              <td>{new Date(member.created_at).toLocaleDateString()}</td>
                              <td>{active ? "Active" : "Suspended"}</td>
                              <td>
                                <div className="row-actions">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={loading || member.id === user.id || member.is_platform_admin}
                                    onClick={() => void toggleUser(member.id)}
                                  >
                                    {active ? "Suspend" : "Reactivate"}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        }) : <tr><td colSpan={7}>No users found.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              }
            />
            <Route
              path="businesses"
              element={<BusinessAccountsPage />}
            />
            <Route
              path="branches"
              element={
                <section className="panel table-panel">
                  <div className="panel-header">
                    <h3>Branch directory</h3>
                    <span>{data.branches.length} branches</span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Branch</th>
                          <th>Business</th>
                          <th>Type</th>
                          <th>Region</th>
                          <th>Address</th>
                          <th>Staff</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.branches.length ? data.branches.map((branch) => (
                          <tr key={branch.id}>
                            <td>{branch.name}</td>
                            <td>{branch.business_name}</td>
                            <td>{branch.category}</td>
                            <td>{branch.country}</td>
                            <td>{branch.address || "Not recorded"}</td>
                            <td>{branch.staff_count}</td>
                            <td>{branch.active === 1 ? "Active" : "Inactive"}</td>
                          </tr>
                        )) : <tr><td colSpan={7}>No branches found.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              }
            />
            <Route
              path="subscriptions"
              element={
                <div className="admin-billing-page">
                  <div className="admin-billing-header">
                    <div>
                      <h1>Subscriptions &amp; billing</h1>
                      <p>Manage plan definitions, business subscriptions, and manually reconciled payment records.</p>
                    </div>
                    <label className="admin-range-control">
                      <span>Payment reporting period</span>
                      <select
                        aria-label="Billing reporting date range"
                        value={range}
                        onChange={(event) => setRange(event.target.value as PlatformAdminRange)}
                      >
                        {Object.entries(rangeLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {!billing && billingLoading ? (
                    <div className="panel admin-billing-empty">Loading billing records…</div>
                  ) : billing ? (
                    <>
                      {!billing.payment_provider_configured && (
                        <div className="admin-billing-notice">
                          No payment gateway is connected. Paid entries below are recorded by an administrator after external payment verification; no payment is charged or verified automatically.
                        </div>
                      )}

                      <div className="admin-billing-summary">
                        <div className="metric-card">
                          <span className="metric-label">Active plans</span>
                          <strong className="metric-value">{billing.summary.plans}</strong>
                          <small className="metric-trend">Plan definitions available for assignment</small>
                        </div>
                        <div className="metric-card">
                          <span className="metric-label">Current subscriptions</span>
                          <strong className="metric-value">{billing.summary.subscribers}</strong>
                          <small className="metric-trend">Trial, active, or past due</small>
                        </div>
                        <div className="metric-card">
                          <span className="metric-label">On trial</span>
                          <strong className="metric-value">{billing.summary.trialing}</strong>
                          <small className="metric-trend">Subscription trial periods</small>
                        </div>
                        <div className="metric-card">
                          <span className="metric-label">Past due</span>
                          <strong className="metric-value">{billing.summary.past_due}</strong>
                          <small className="metric-trend">Requires billing follow-up</small>
                        </div>
                        {billing.summary.paid_by_currency.map((item) => (
                          <div className="metric-card" key={item.currency}>
                            <span className="metric-label">Payments recorded · {item.currency}</span>
                            <strong className="metric-value">{moneyByCurrency([{ currency: item.currency, total: item.total }], "total")}</strong>
                            <small className="metric-trend">{item.payments} marked paid · {rangeLabels[range].toLowerCase()}</small>
                          </div>
                        ))}
                      </div>

                      <section className="admin-billing-grid">
                        <form
                          className="panel admin-billing-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const scale = currencyScale(planDraft.currency);
                            void runBillingAction(
                              editingPlanId ? "update_plan" : "create_plan",
                              {
                                ...(editingPlanId ? { plan_id: editingPlanId } : {}),
                                ...planDraft,
                                name: planDraft.name.trim(),
                                amount: Math.round(Number(planDraft.amount) * 10 ** scale),
                                trial_days: Number(planDraft.trial_days),
                              },
                              editingPlanId ? "Plan updated." : "Plan created.",
                            ).then((saved) => {
                              if (!saved) return;
                              setEditingPlanId("");
                              setPlanDraft({
                                name: "",
                                description: "",
                                amount: "",
                                currency: "TZS",
                                billing_interval: "month",
                                trial_days: "0",
                              });
                            });
                          }}
                        >
                          <div className="admin-billing-section-title">
                            <div>
                              <h2>{editingPlanId ? "Edit plan" : "Create a plan"}</h2>
                              <p>Prices use the selected currency. Plan changes do not rewrite existing subscriptions.</p>
                            </div>
                          </div>
                          <label>
                            Plan name
                            <input required maxLength={100} value={planDraft.name} onChange={(event) => setPlanDraft({ ...planDraft, name: event.target.value })} />
                          </label>
                          <label>
                            Description
                            <textarea maxLength={2000} rows={3} value={planDraft.description} onChange={(event) => setPlanDraft({ ...planDraft, description: event.target.value })} />
                          </label>
                          <div className="admin-form-row">
                            <label>
                              Price
                              <input required type="number" min="0" step={1 / 10 ** currencyScale(planDraft.currency)} value={planDraft.amount} onChange={(event) => setPlanDraft({ ...planDraft, amount: event.target.value })} />
                            </label>
                            <label>
                              Currency
                              <input required pattern="[A-Za-z]{3}" maxLength={3} value={planDraft.currency} onChange={(event) => setPlanDraft({ ...planDraft, currency: event.target.value.toUpperCase() })} />
                            </label>
                          </div>
                          <div className="admin-form-row">
                            <label>
                              Billing interval
                              <select value={planDraft.billing_interval} onChange={(event) => setPlanDraft({ ...planDraft, billing_interval: event.target.value as "month" | "year" })}>
                                <option value="month">Monthly</option>
                                <option value="year">Yearly</option>
                              </select>
                            </label>
                            <label>
                              Trial (days)
                              <input type="number" min="0" max="365" step="1" value={planDraft.trial_days} onChange={(event) => setPlanDraft({ ...planDraft, trial_days: event.target.value })} />
                            </label>
                          </div>
                          <div className="admin-billing-form-actions">
                            <Button type="submit" disabled={billingBusy}>
                              {billingBusy ? "Saving…" : editingPlanId ? "Save changes" : "Create plan"}
                            </Button>
                            {editingPlanId && (
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  setEditingPlanId("");
                                  setPlanDraft({
                                    name: "",
                                    description: "",
                                    amount: "",
                                    currency: "TZS",
                                    billing_interval: "month",
                                    trial_days: "0",
                                  });
                                }}
                              >
                                Cancel edit
                              </Button>
                            )}
                          </div>
                        </form>

                        <form
                          className="panel admin-billing-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void runBillingAction(
                              "assign_subscription",
                              {
                                business_id: subscriptionDraft.business_id,
                                plan_id: subscriptionDraft.plan_id,
                                ...(subscriptionDraft.amount
                                  ? {
                                      amount: Math.round(
                                        Number(subscriptionDraft.amount) *
                                          10 ** currencyScale(subscriptionDraft.currency),
                                      ),
                                    }
                                  : {}),
                                ...(subscriptionDraft.currency
                                  ? { currency: subscriptionDraft.currency.toUpperCase() }
                                  : {}),
                              },
                              "Subscription assigned. Any previous current subscription for this business was canceled.",
                            );
                          }}
                        >
                          <div className="admin-billing-section-title">
                            <div>
                              <h2>Assign a subscription</h2>
                              <p>Assigning a plan replaces the business&apos;s current trial or subscription.</p>
                            </div>
                          </div>
                          <label>
                            Business
                            <select required value={subscriptionDraft.business_id} onChange={(event) => setSubscriptionDraft({ ...subscriptionDraft, business_id: event.target.value })}>
                              <option value="">Select a business</option>
                              {billing.businesses.map((business) => (
                                <option key={business.id} value={business.id}>{business.name} · {business.currency}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Plan
                            <select required value={subscriptionDraft.plan_id} onChange={(event) => {
                              const plan = billing.plans.find((item) => item.id === event.target.value);
                              setSubscriptionDraft({
                                ...subscriptionDraft,
                                plan_id: event.target.value,
                                amount: "",
                                currency: plan?.currency || "",
                              });
                            }}>
                              <option value="">Select an active plan</option>
                              {billing.plans.filter((plan) => plan.active).map((plan) => (
                                <option key={plan.id} value={plan.id}>{plan.name} · {moneyByCurrency([{ currency: plan.currency, total: plan.amount }], "total")} / {plan.billing_interval}</option>
                              ))}
                            </select>
                          </label>
                          <div className="admin-form-row">
                            <label>
                              Price override (optional)
                              <input type="number" min="0" step={1 / 10 ** currencyScale(subscriptionDraft.currency || "TZS")} value={subscriptionDraft.amount} onChange={(event) => setSubscriptionDraft({ ...subscriptionDraft, amount: event.target.value })} />
                            </label>
                            <label>
                              Billing currency
                              <input pattern="[A-Za-z]{3}" maxLength={3} value={subscriptionDraft.currency} onChange={(event) => setSubscriptionDraft({ ...subscriptionDraft, currency: event.target.value.toUpperCase() })} />
                            </label>
                          </div>
                          <div className="admin-billing-form-actions">
                            <Button type="submit" disabled={billingBusy || !billing.plans.some((plan) => plan.id === subscriptionDraft.plan_id && plan.active)}>
                              Assign subscription
                            </Button>
                          </div>
                        </form>
                      </section>

                      <section className="panel table-panel">
                        <div className="panel-header">
                          <div>
                            <h3>Subscription plans</h3>
                            <p>Manage available plan definitions.</p>
                          </div>
                          <Button variant="ghost" disabled={billingLoading} onClick={() => void loadBilling()}>Refresh</Button>
                        </div>
                        <div className="table-wrap">
                          <table>
                            <thead><tr><th>Plan</th><th>Price</th><th>Trial</th><th>Subscribers</th><th>Status</th><th>Actions</th></tr></thead>
                            <tbody>
                              {billing.plans.length ? billing.plans.map((plan) => (
                                <tr key={plan.id}>
                                  <td>{plan.name}<div className="muted">{plan.description || "No description"}</div></td>
                                  <td>{moneyByCurrency([{ currency: plan.currency, total: plan.amount }], "total")} / {plan.billing_interval}</td>
                                  <td>{plan.trial_days ? `${plan.trial_days} days` : "No trial"}</td>
                                  <td>{plan.current_subscribers}</td>
                                  <td>{plan.active ? "Active" : "Archived"}</td>
                                  <td>
                                    <div className="row-actions">
                                      <Button size="sm" variant="secondary" disabled={billingBusy} onClick={() => {
                                        setEditingPlanId(plan.id);
                                        setPlanDraft({
                                          name: plan.name,
                                          description: plan.description,
                                          amount: String(Number(plan.amount) / 10 ** currencyScale(plan.currency)),
                                          currency: plan.currency,
                                          billing_interval: plan.billing_interval,
                                          trial_days: String(plan.trial_days),
                                        });
                                      }}>Edit</Button>
                                      <Button size="sm" variant="ghost" disabled={billingBusy} onClick={() => void runBillingAction("update_plan", { plan_id: plan.id, active: !plan.active }, plan.active ? "Plan archived." : "Plan reactivated.")}>
                                        {plan.active ? "Archive" : "Reactivate"}
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              )) : <tr><td colSpan={6}>No plans yet. Create a plan to start assigning subscriptions.</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      <section className="panel table-panel">
                        <div className="panel-header">
                          <div>
                            <h3>Business subscriptions</h3>
                            <p>Historical and current subscription assignments.</p>
                          </div>
                          <span>{billing.subscriptions.length} subscriptions</span>
                        </div>
                        <div className="table-wrap">
                          <table>
                            <thead><tr><th>Business</th><th>Plan</th><th>Price</th><th>Status</th><th>Period ends</th><th>Actions</th></tr></thead>
                            <tbody>
                              {billing.subscriptions.length ? billing.subscriptions.map((subscription) => (
                                <tr key={subscription.id}>
                                  <td>{subscription.business_name}</td>
                                  <td>{subscription.plan_name}</td>
                                  <td>{moneyByCurrency([{ currency: subscription.currency, total: subscription.amount }], "total")} / {subscription.billing_interval}</td>
                                  <td><span className={`billing-status ${subscription.status}`}>{subscription.status.replace("_", " ")}</span></td>
                                  <td>{new Date(
                                    subscription.status === "trialing" && subscription.trial_end
                                      ? subscription.trial_end
                                      : subscription.current_period_end,
                                  ).toLocaleDateString()}</td>
                                  <td>
                                    <div className="row-actions">
                                      {["trialing", "active", "past_due"].includes(subscription.status) && (
                                        <Button size="sm" variant="destructive" disabled={billingBusy} onClick={() => {
                                          if (window.confirm(`Cancel the subscription for ${subscription.business_name}?`))
                                            void runBillingAction("cancel_subscription", { subscription_id: subscription.id }, "Subscription canceled.");
                                        }}>Cancel</Button>
                                      )}
                                      <Button size="sm" variant="secondary" disabled={billingBusy} onClick={() => setPaymentDraft({
                                        subscription_id: subscription.id,
                                        amount: String(Number(subscription.amount) / 10 ** currencyScale(subscription.currency)),
                                        currency: subscription.currency,
                                        method: "manual",
                                        status: "pending",
                                        external_reference: "",
                                        note: "",
                                      })}>Record payment</Button>
                                    </div>
                                  </td>
                                </tr>
                              )) : <tr><td colSpan={6}>No subscriptions assigned yet.</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      <section className="admin-billing-grid">
                        <form
                          className="panel admin-billing-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const subscription = billing.subscriptions.find((item) => item.id === paymentDraft.subscription_id);
                            if (!subscription) {
                              setBillingError("Select a subscription before recording a payment.");
                              return;
                            }
                            void runBillingAction(
                              "record_payment",
                              {
                                subscription_id: subscription.id,
                                amount: Math.round(
                                  Number(paymentDraft.amount) *
                                    10 ** currencyScale(paymentDraft.currency),
                                ),
                                currency: paymentDraft.currency.toUpperCase(),
                                method: paymentDraft.method,
                                status: paymentDraft.status,
                                external_reference: paymentDraft.external_reference.trim(),
                                note: paymentDraft.note.trim(),
                              },
                              "Payment record added to the ledger.",
                            ).then(() => setPaymentDraft((current) => ({
                              ...current,
                              external_reference: "",
                              note: "",
                            })));
                          }}
                        >
                          <div className="admin-billing-section-title">
                            <div>
                              <h2>Record a payment</h2>
                              <p>Only mark a payment paid after verifying it outside this system.</p>
                            </div>
                          </div>
                          <label>
                            Subscription
                            <select required value={paymentDraft.subscription_id} onChange={(event) => {
                              const subscription = billing.subscriptions.find((item) => item.id === event.target.value);
                              setPaymentDraft({
                                ...paymentDraft,
                                subscription_id: event.target.value,
                                amount: subscription ? String(Number(subscription.amount) / 10 ** currencyScale(subscription.currency)) : "",
                                currency: subscription?.currency || "",
                              });
                            }}>
                              <option value="">Select a subscription</option>
                              {billing.subscriptions.map((subscription) => (
                                <option key={subscription.id} value={subscription.id}>{subscription.business_name} · {subscription.plan_name} · {subscription.status}</option>
                              ))}
                            </select>
                          </label>
                          <div className="admin-form-row">
                            <label>
                              Amount
                              <input required type="number" min="0.01" step={1 / 10 ** currencyScale(paymentDraft.currency || "TZS")} value={paymentDraft.amount} onChange={(event) => setPaymentDraft({ ...paymentDraft, amount: event.target.value })} />
                            </label>
                            <label>
                              Currency
                              <input required pattern="[A-Za-z]{3}" maxLength={3} value={paymentDraft.currency} onChange={(event) => setPaymentDraft({ ...paymentDraft, currency: event.target.value.toUpperCase() })} />
                            </label>
                          </div>
                          <div className="admin-form-row">
                            <label>
                              Method
                              <select value={paymentDraft.method} onChange={(event) => setPaymentDraft({ ...paymentDraft, method: event.target.value })}>
                                <option value="manual">Manual</option>
                                <option value="cash">Cash</option>
                                <option value="bank_transfer">Bank transfer</option>
                                <option value="mobile_money">Mobile money</option>
                                <option value="other">Other</option>
                              </select>
                            </label>
                            <label>
                              Status
                              <select value={paymentDraft.status} onChange={(event) => setPaymentDraft({ ...paymentDraft, status: event.target.value })}>
                                <option value="pending">Pending</option>
                                <option value="paid">Paid (verified externally)</option>
                                <option value="failed">Failed</option>
                                <option value="refunded">Refunded</option>
                              </select>
                            </label>
                          </div>
                          <label>
                            External receipt/reference (optional)
                            <input maxLength={200} value={paymentDraft.external_reference} onChange={(event) => setPaymentDraft({ ...paymentDraft, external_reference: event.target.value })} />
                          </label>
                          <label>
                            Admin note
                            <textarea maxLength={1000} rows={2} value={paymentDraft.note} onChange={(event) => setPaymentDraft({ ...paymentDraft, note: event.target.value })} />
                          </label>
                          <Button type="submit" disabled={billingBusy || !paymentDraft.subscription_id}>
                            {billingBusy ? "Saving…" : "Add payment record"}
                          </Button>
                        </form>
                      </section>

                      <section className="panel table-panel">
                        <div className="panel-header">
                          <div>
                            <h3>Payment ledger</h3>
                            <p>Latest manually recorded billing entries · {rangeLabels[range].toLowerCase()}.</p>
                          </div>
                          <span>Latest {billing.payments.length}</span>
                        </div>
                        <div className="table-wrap">
                          <table>
                            <thead><tr><th>Date</th><th>Business</th><th>Amount</th><th>Method</th><th>Status</th><th>Reference</th><th>Recorded by</th><th>Note</th></tr></thead>
                            <tbody>
                              {billing.payments.length ? billing.payments.map((payment) => (
                                <tr key={payment.id}>
                                  <td>{new Date(payment.created_at).toLocaleString()}</td>
                                  <td>{payment.business_name}</td>
                                  <td>{moneyByCurrency([{ currency: payment.currency, total: payment.amount }], "total")}</td>
                                  <td>{payment.method.replace("_", " ")}</td>
                                  <td><span className={`billing-status ${payment.status}`}>{payment.status}</span></td>
                                  <td>{payment.external_reference || "—"}</td>
                                  <td>{payment.recorded_by || "Platform admin"}</td>
                                  <td>{payment.note || "—"}</td>
                                </tr>
                              )) : <tr><td colSpan={8}>{billingLoading ? "Loading payments…" : "No payments recorded for this reporting period."}</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    </>
                  ) : (
                    <div className="panel admin-billing-empty">
                      {billingLoading ? "Loading billing records…" : "Billing data is unavailable. Use refresh to try again."}
                      {!billingLoading && <Button variant="secondary" onClick={() => void loadBilling()}>Retry</Button>}
                    </div>
                  )}
                </div>
              }
            />
            <Route
              path="inventory"
              element={
                <div className="admin-operation-page">
                  {operationToolbar(operation?.total, "products")}
                  <section className="panel table-panel">
                    <div className="panel-header">
                      <div>
                        <h3>Platform inventory</h3>
                        <p>Live stock across active branches, grouped by each business.</p>
                      </div>
                      {operation?.limited && <span>Showing first 250</span>}
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Business</th>
                            <th>SKU</th>
                            <th>Category</th>
                            <th>Total stock</th>
                            <th>Low-stock branches</th>
                            <th>Cost value</th>
                            <th>Branch stock</th>
                          </tr>
                        </thead>
                        <tbody>
                          {operation?.inventory?.length ? operation.inventory.map((item) => (
                            <tr key={item.id}>
                              <td>{item.name}</td>
                              <td>{item.business_name}</td>
                              <td>{item.sku}</td>
                              <td>{item.category}</td>
                              <td>{Number(item.total_quantity).toLocaleString()} {item.unit}</td>
                              <td>{item.low_stock_locations}</td>
                              <td>{moneyByCurrency([{ currency: item.currency, total: Number(item.cost) * Number(item.total_quantity) }], "total")}</td>
                              <td>{item.branch_stock.map((branch) => (
                                <span key={branch.branch_id} className={branch.low_stock ? "stock-chip low" : "stock-chip"}>
                                  {branch.branch_name}: {Number(branch.quantity).toLocaleString()}
                                </span>
                              ))}</td>
                            </tr>
                          )) : <tr><td colSpan={8}>{operationLoading ? "Loading inventory…" : "No inventory records found."}</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              }
            />
            <Route
              path="sales"
              element={
                <div className="admin-operation-page">
                  {operationToolbar(operation?.total, "sales")}
                  {operation?.sales_by_currency?.length ? (
                    <div className="admin-operation-stats">
                      {operation.sales_by_currency.map((summary) => (
                        <div className="metric-card" key={summary.currency}>
                          <span className="metric-label">Sales · {summary.currency}</span>
                          <strong className="metric-value">{moneyByCurrency([{ currency: summary.currency, total: summary.total }], "total")}</strong>
                          <small className="metric-trend">{summary.transactions.toLocaleString()} completed transactions</small>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <section className="panel table-panel">
                    <div className="panel-header">
                      <div>
                        <h3>Platform-wide sales</h3>
                        <p>Sales in {rangeLabels[range].toLowerCase()}, shown in their original business currency.</p>
                      </div>
                      <span>{operation?.total ?? 0} sales</span>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Reference</th>
                            <th>Business / branch</th>
                            <th>Industry</th>
                            <th>Amount</th>
                            <th>Paid</th>
                            <th>Method</th>
                            <th>Status</th>
                            <th>Recorded by</th>
                            <th>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {operation?.sales?.length ? operation.sales.map((sale) => (
                            <tr key={sale.id}>
                              <td>{sale.reference}</td>
                              <td>{sale.business_name}<div className="muted">{sale.branch_name}</div></td>
                              <td>{sale.category}</td>
                              <td>{moneyByCurrency([{ currency: sale.currency, total: sale.total }], "total")}</td>
                              <td>{moneyByCurrency([{ currency: sale.currency, total: sale.paid }], "total")}</td>
                              <td>{sale.method}</td>
                              <td>{sale.status}</td>
                              <td>{sale.actor_name || "Unknown"}</td>
                              <td>{new Date(sale.created_at).toLocaleString()}</td>
                            </tr>
                          )) : <tr><td colSpan={9}>{operationLoading ? "Loading sales…" : "No sales in this date range."}</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              }
            />
            <Route
              path="transactions"
              element={
                <div className="admin-operation-page">
                  {operationToolbar(operation?.total, "transactions")}
                  <section className="panel table-panel">
                    <div className="panel-header">
                      <div>
                        <h3>Platform transactions</h3>
                        <p>Sales, purchases, and expenses · {rangeLabels[range].toLowerCase()}.</p>
                      </div>
                      {operation?.total && operation.total > 100 && <span>Latest 100 shown</span>}
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Reference</th>
                            <th>Business / branch</th>
                            <th>Details</th>
                            <th>Amount</th>
                            <th>Paid</th>
                            <th>Status</th>
                            <th>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {operation?.transactions?.length ? operation.transactions.map((transaction) => (
                            <tr key={`${transaction.type}-${transaction.id}`}>
                              <td>{transaction.type}</td>
                              <td>{transaction.reference}</td>
                              <td>{transaction.business_name}<div className="muted">{transaction.branch_name}</div></td>
                              <td>{transaction.detail}</td>
                              <td>{moneyByCurrency([{ currency: transaction.currency, total: transaction.amount }], "total")}</td>
                              <td>{moneyByCurrency([{ currency: transaction.currency, total: transaction.paid }], "total")}</td>
                              <td>{transaction.status}</td>
                              <td>{new Date(transaction.created_at).toLocaleString()}</td>
                            </tr>
                          )) : <tr><td colSpan={8}>{operationLoading ? "Loading transactions…" : "No transactions in this date range."}</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              }
            />
            <Route
              path="reports"
              element={
                <div className="admin-operation-page">
                  {operationToolbar(undefined, "records", false)}
                  <div className="admin-operation-stats">
                    {[
                      { label: "Sales", values: operation?.sales_by_currency || [] },
                      { label: "Purchases", values: operation?.purchases_by_currency || [] },
                      { label: "Expenses", values: operation?.expenses_by_currency || [] },
                    ].map(({ label, values }) => (
                      <section className="panel admin-report-card" key={String(label)}>
                        <h3>{label} by currency</h3>
                        {Array.isArray(values) && values.length ? values.map((summary) => (
                          <div className="admin-report-row" key={summary.currency}>
                            <span>{summary.currency}</span>
                            <strong>{moneyByCurrency([{ currency: summary.currency, total: summary.total }], "total")}</strong>
                            <small>{summary.transactions} records</small>
                          </div>
                        )) : <p className="muted">{operationLoading ? "Loading report…" : "No records for this period."}</p>}
                      </section>
                    ))}
                  </div>
                  <section className="panel admin-report-chart">
                    <div className="panel-heading">
                      <div>
                        <h3>Daily operational activity</h3>
                        <p>Recorded sales, purchases, and expenses · {rangeLabels[range].toLowerCase()}.</p>
                      </div>
                    </div>
                    <div className="admin-report-bars">
                      {(() => {
                        const points = operation?.daily_activity || [];
                        const max = Math.max(1, ...points.map((point) => point.sales + point.purchases + point.expenses));
                        return points.slice(-15).map((point) => (
                          <div className="admin-report-bar" key={point.date} title={`${point.date}: ${point.sales} sales, ${point.purchases} purchases, ${point.expenses} expenses`}>
                            <span style={{ height: `${Math.max(3, ((point.sales + point.purchases + point.expenses) / max) * 100)}%` }} />
                            <small>{new Date(`${point.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small>
                          </div>
                        ));
                      })()}
                    </div>
                  </section>
                  <section className="panel table-panel">
                    <div className="panel-header"><h3>Business types</h3></div>
                    <div className="admin-type-list">
                      {(operation?.business_types || []).map((item) => (
                        <div className="admin-type-row" key={item.type}>
                          <span>{item.type}</span>
                          <span>{item.count} businesses</span>
                        </div>
                      ))}
                      {!operation?.business_types?.length && <p className="muted">{operationLoading ? "Loading report…" : "No business categories recorded."}</p>}
                    </div>
                  </section>
                </div>
              }
            />
            <Route
              path="audit-logs"
              element={
                <div className="admin-operation-page">
                  {operationToolbar(operation?.total, "audit events")}
                  <section className="panel table-panel">
                    <div className="panel-header">
                      <div>
                        <h3>Platform audit trail</h3>
                        <p>Activity recorded across tenant workspaces · {rangeLabels[range].toLowerCase()}.</p>
                      </div>
                      {operation?.total && operation.total > 100 && <span>Latest 100 shown</span>}
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Business / branch</th>
                            <th>Actor</th>
                            <th>Category</th>
                            <th>Entity</th>
                            <th>Description</th>
                            <th>Reference</th>
                          </tr>
                        </thead>
                        <tbody>
                          {operation?.audit_logs?.length ? operation.audit_logs.map((event) => (
                            <tr key={event.id}>
                              <td>{new Date(event.created_at).toLocaleString()}</td>
                              <td>{event.business_name}<div className="muted">{event.branch_name || "Business-wide"}</div></td>
                              <td>{event.actor_name || "Unknown"}</td>
                              <td>{event.category}</td>
                              <td>{event.entity}</td>
                              <td>{event.description}</td>
                              <td>{event.reference}</td>
                            </tr>
                          )) : <tr><td colSpan={7}>{operationLoading ? "Loading audit log…" : "No audit events in this date range."}</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              }
            />
            <Route
              path="approvals"
              element={
                <PlatformAdminConsolePage
                  section="approvals"
                  businesses={data.businesses}
                  adminId={user.id}
                />
              }
            />
            <Route
              path="restaurant-pos"
              element={
                <PlatformAdminConsolePage
                  section="restaurant-pos"
                  businesses={data.businesses}
                  adminId={user.id}
                />
              }
            />
            <Route
              path="support"
              element={
                <PlatformAdminConsolePage
                  section="support"
                  businesses={data.businesses}
                  adminId={user.id}
                />
              }
            />
            <Route
              path="settings"
              element={
                <PlatformAdminConsolePage
                  section="settings"
                  businesses={data.businesses}
                  adminId={user.id}
                />
              }
            />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function WorkspaceApp({
  user,
  onLogout,
  onUser,
}: {
  user: User;
  onLogout: () => void;
  onUser: (u: User) => void;
}) {
  const [branch, setBranch] = useState(user.branch_id),
    [data, setData] = useState<Workspace | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [drawer, setDrawer] = useState(false),
    [action, setAction] = useState<Action | null>(null),
    [toast, setToast] = useState(""),
    [theme, setThemeState] = useState<"dark" | "light">(user.theme || "dark");
  const location = useLocation();
  const refresh = useCallback(async () => {
    const d = await api<Workspace>(
      "/workspace?branch=" + encodeURIComponent(branch),
    );
    setData(d);
    onUser(d.user);
    setError("");
    return d;
  }, [branch, onUser]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api<Workspace>("/workspace?branch=" + encodeURIComponent(branch))
      .then((d) => {
        if (active) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          if (
            e.message === "Sign in to continue." ||
            e.message === "Your sign-in session has expired. Sign in again."
          )
            void onLogout();
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [branch]);
  useEffect(() => {
    setDrawer(false);
  }, [location.pathname]);
  useEffect(() => {
    let active = true;
    const checkAccountStatus = async () => {
      try {
        const identity = await api<{ user: User }>("/auth/me");
        if (active) onUser(identity.user);
      } catch (e) {
        if (active) {
          setError(
            e instanceof Error
              ? e.message
              : "Unable to refresh your business account status.",
          );
          if (
            e instanceof Error &&
            (e.message === "Sign in to continue." ||
              e.message === "Your sign-in session has expired. Sign in again.")
          )
            void onLogout();
        }
      }
    };
    const interval = window.setInterval(() => void checkAccountStatus(), 15000);
    window.addEventListener("focus", checkAccountStatus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", checkAccountStatus);
    };
  }, [onLogout, onUser]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  async function setTheme(s: "dark" | "light") {
    try {
      await api(
        "/profile",
        { name: data?.user.name || user.name, theme: s },
        "PUT",
      );
      setThemeState(s);
      const next = { ...(data?.user || user), theme: s };
      setData((d) => (d ? { ...d, user: next } : d));
      onUser(next);
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  const write = async (path: string, body: unknown = {}, method = "POST") => {
    const r = await api(path, body, method);
    await refresh();
    return r;
  };
  const isSystemAdmin = isSystemAdminUser(user);
  const canManage = isSystemAdmin || user.role !== "cashier";
  if (!data || loading)
    return (
      <div className="app-loading">
        <Logo />
        <div className="loading-line" />
        {error ? (
          <>
            <p role="alert">{error}</p>
            <Button
              onClick={() => location.pathname && window.location.reload()}
            >
              Try again
            </Button>
            <Button variant="ghost" onClick={onLogout}>
              Sign out
            </Button>
          </>
        ) : (
          <p>Getting your workspace ready…</p>
        )}
      </div>
    );
  const scale =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: data.business.currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const money = (n: number) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: data.business.currency,
      maximumFractionDigits: scale,
    }).format(n / 10 ** scale);
  const current = links.find((l) => l.to === location.pathname);
  return (
    <WorkContext.Provider
      value={{
        data,
        branch,
        refresh,
        money,
        scale,
        act: (type, record) => setAction({ type, record }),
        notify: setToast,
        write,
        canManage,
        setTheme,
      }}
    >
      <div className="app-shell">
        {drawer && (
          <button
            aria-label="Close navigation"
            className="drawer-shade"
            onClick={() => setDrawer(false)}
          />
        )}
        <aside className={"sidebar " + (drawer ? "open" : "")}>
          <Link to="/app" className="sidebar-brand">
            <Logo />
            <span className="brand-caption">YOUR BUSINESS, IN SYNC</span>
          </Link>
          <div className="business-switch">
            <span className="business-icon">
              <Store size={19} />
            </span>
            <div>
              <strong>{data.business.name}</strong>
              <small>Business workspace</small>
            </div>
            <ChevronDown size={14} />
          </div>
          <nav aria-label="Main navigation">
            {(canManage
              ? links
              : links.filter((l) =>
                  ["/app", "/app/sales", "/app/support"].includes(l.to),
                )
            )
              .filter((l) => !l.owner || user.role === "owner" || isSystemAdmin)
              .filter(
                (l) =>
                  l.to !== "/app/restaurant" ||
                  data.business.category === "Restaurant",
              )
              .map((l) => (
                <div key={l.to}>
                  {l.section && <div className="nav-section">{l.section}</div>}
                  <NavLink
                    to={l.to}
                    end={l.to === "/app"}
                    className={({ isActive }) =>
                      isActive ? "nav-item active" : "nav-item"
                    }
                  >
                    <l.icon size={18} />
                    <span>{l.label}</span>
                    {l.to === "/app/stock-alerts" &&
                      data.products.some((p) => p.stock <= p.threshold) && (
                        <span className="nav-count">
                          {
                            data.products.filter((p) => p.stock <= p.threshold)
                              .length
                          }
                        </span>
                      )}
                  </NavLink>
                </div>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <NavLink to="/app/profile" className="user-card">
              <span className="avatar">
                {user.name.slice(0, 2).toUpperCase()}
              </span>
              <span>
                <strong>{user.name}</strong>
                <small>{user.role}</small>
              </span>
              <Settings size={16} />
            </NavLink>
            <button className="logout" onClick={onLogout}>
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="row">
              <Button
                className="mobile-toggle"
                variant="ghost"
                size="icon"
                aria-label="Open navigation"
                onClick={() => setDrawer(true)}
              >
                <Menu size={21} />
              </Button>
              <span className="breadcrumb">
                Workspace <span>/</span>{" "}
                <strong>
                  {current?.label ||
                    (location.pathname.includes("pos")
                      ? "Point of sale"
                      : "My profile")}
                </strong>
              </span>
            </div>
            <div className="topbar-actions">
              <label className="branch-select">
                <Store size={15} />
                <select
                  aria-label="Active branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                >
                  {data.branches
                    .filter(
                      (b) =>
                        b.active &&
                        (user.role === "owner" || isSystemAdmin || b.id === user.branch_id),
                    )
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </label>
              <span className="topbar-divider" />
              <Button
                size="icon"
                variant="ghost"
                aria-label={
                  "Switch to " +
                  (theme === "dark" ? "light" : "dark") +
                  " theme"
                }
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </Button>
              <Button className="cashier-button" asChild>
                <Link to="/app/pos">
                  <ShoppingCart size={16} /> Cashier mode{" "}
                  <ArrowUpRight size={15} />
                </Link>
              </Button>
            </div>
          </header>
          <main className="main-content">
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <Routes>
              <Route index element={<Dashboard />} />
              <Route
                path="inventory"
                element={canManage ? <Inventory /> : <Navigate to="/app/pos" />}
              />
              <Route
                path="stock-alerts"
                element={
                  canManage ? <Inventory alerts /> : <Navigate to="/app/pos" />
                }
              />
              <Route path="pos" element={<POS key={branch} />} />
              <Route
                path="restaurant"
                element={
                  canManage && data.business.category === "Restaurant" ? (
                    <Restaurant />
                  ) : (
                    <Navigate to="/app" replace />
                  )
                }
              />
              <Route
                path="support"
                element={<WorkspaceSupportPage businessName={data.business.name} />}
              />
              <Route path="sales" element={<Records kind="sales" />} />
              <Route
                path="reports"
                element={canManage ? <Reports /> : <Navigate to="/app" />}
              />
              <Route
                path="reports/eod"
                element={canManage ? <CashierEodReports /> : <Navigate to="/app" />}
              />
              <Route
                path="transactions"
                element={canManage ? <Transactions /> : <Navigate to="/app" />}
              />
              {[
                "customers",
                "suppliers",
                "purchases",
                "expenses",
                "staff",
                "branches",
                "downloads",
              ].map((kind) => (
                <Route
                  key={kind}
                  path={kind}
                  element={
                    canManage ? <Records kind={kind} /> : <Navigate to="/app" />
                  }
                />
              ))}
              <Route
                path="settings"
                element={
                  user.role === "owner" || isSystemAdmin ? (
                    <SettingsPage />
                  ) : (
                    <Navigate to="/app" />
                  )
                }
              />
              <Route
                path="settings/documents"
                element={
                  user.role === "owner" || isSystemAdmin ? (
                    <DocumentTemplates />
                  ) : (
                    <Navigate to="/app" />
                  )
                }
              />
              <Route path="profile" element={<SettingsPage profile />} />
              <Route path="*" element={<Navigate to="/app" />} />
            </Routes>
            <footer className="workspace-footer">
              <span>
                © {new Date().getFullYear()} Smartsell{" "}
                <span className="footer-dot">·</span> Your business, in sync.
              </span>
              <span>
                Cloud workspace <span className="live-dot" />
              </span>
            </footer>
          </main>
        </div>
        {action && (
          <ActionDialog
            key={action.type + (action.record?.id || "")}
            type={action.type}
            record={action.record}
            onClose={() => setAction(null)}
          />
        )}
        {toast && (
          <div className="toast" role="status">
            {toast}
            <button
              onClick={() => setToast("")}
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </WorkContext.Provider>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [authError, setAuthError] = useState("");
  useEffect(() => {
    let active = true;
    let authRevision = 0;
    const loadUser = () => {
      const requestRevision = authRevision;
      void api("/auth/me")
        .then((r) => {
          if (!active || requestRevision !== authRevision) return;
          setUser(r.user);
          setAuthError("");
          document.documentElement.dataset.theme = r.user.theme;
        })
        .catch((e) => {
          if (!active || requestRevision !== authRevision) return;
          setUser(null);
          if ((e as Error).message !== "Sign in to continue.")
            setAuthError((e as Error).message);
          else setAuthError("");
        })
        .finally(() => {
          if (active && requestRevision === authRevision) setReady(true);
        });
    };
    const {
      data: { subscription },
    } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        authRevision += 1;
        setUser(null);
        setAuthError("");
        setReady(true);
      } else if (event === "SIGNED_IN") {
        authRevision += 1;
        window.setTimeout(loadUser, 0);
      }
    });
    loadUser();
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  async function logout() {
    try {
      await api("/auth/logout", {});
      setUser(null);
    } catch (e) {
      window.alert((e as Error).message);
    }
  }
  if (!ready)
    return (
      <div className="app-loading">
        <Logo />
        <div className="loading-line" />
      </div>
    );
  if (authError)
    return (
      <div className="app-loading">
        <Logo />
        <div className="error" role="alert">{authError}</div>
        <Button onClick={() => window.location.reload()}>Retry connection</Button>
      </div>
    );
  if (user?.must_change_password)
    return (
      <BrowserRouter>
        <Auth register={false} forcePassword onUser={setUser} />
      </BrowserRouter>
    );
  if (user?.account_status === "suspended" && !isSystemAdminUser(user))
    return (
      <main className="business-suspension-screen">
        <div className="business-suspension-card">
          <div className="business-suspension-icon">
            <TriangleAlert size={25} />
          </div>
          <Logo />
          <p className="eyebrow">BUSINESS ACCOUNT ON HOLD</p>
          <h1>Workspace access is suspended</h1>
          <p>
            This business account is currently on hold. Members cannot access
            or make changes to the business workspace until it is reactivated
            by a platform administrator.
          </p>
          {user.suspension_reason && (
            <div className="business-suspension-reason">
              <strong>Reason provided</strong>
              <span>{user.suspension_reason}</span>
            </div>
          )}
          <p className="business-suspension-help">
            Contact the Smartsell platform team to discuss reactivating this
            account.
          </p>
          <Button variant="secondary" onClick={() => void logout()}>
            <LogOut size={16} />
            Sign out
          </Button>
        </div>
      </main>
    );
  const memberAccessMessage =
    user?.member_status === "pending"
      ? "Your team account is pending approval by the business owner."
      : user?.member_status === "suspended"
        ? "Your team access has been suspended by the business owner."
        : user?.access_expired
          ? "Your team access has expired. Contact the business owner."
          : "";
  if (user && !isSystemAdminUser(user) && memberAccessMessage)
    return (
      <main className="business-suspension-screen">
        <div className="business-suspension-card">
          <Logo />
          <p className="eyebrow">TEAM ACCOUNT ACCESS</p>
          <h1>Workspace access is unavailable</h1>
          <p>{memberAccessMessage}</p>
          <Button variant="secondary" onClick={() => void logout()}>
            <LogOut size={16} />
            Sign out
          </Button>
        </div>
      </main>
    );
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            user ? (
              <Navigate to={isSystemAdminUser(user) ? "/admin" : "/app"} />
            ) : (
              <Landing />
            )
          }
        />
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to={isSystemAdminUser(user) ? "/admin" : "/app"} />
            ) : (
              <Auth register={false} onUser={setUser} />
            )
          }
        />
        <Route
          path="/register"
          element={
            user ? (
              <Navigate to={isSystemAdminUser(user) ? "/admin" : "/app"} />
            ) : (
              <Auth register onUser={setUser} />
            )
          }
        />
        <Route
          path="/admin/*"
          element={
            user ? (
              isSystemAdminUser(user) ? (
                <AdminConsole user={user} onLogout={logout} />
              ) : (
                <Navigate to="/app" />
              )
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/app/*"
          element={
            user ? (
              <WorkspaceApp user={user} onUser={setUser} onLogout={logout} />
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

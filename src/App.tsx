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
  Contact,
  Truck,
  ReceiptText,
  History,
  Download,
  Settings,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  ChevronDown,
  ArrowUpRight,
  ShieldCheck,
  Utensils,
} from "lucide-react";
import { api, type User, type Workspace, type Row } from "./lib/api";
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
  { to: "/app/downloads", label: "Downloads", icon: Download },
  { to: "/app/settings", label: "Settings", icon: Settings, owner: true },
];
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
        if (active) setError(e.message);
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
  const supabaseConfigured = Boolean(
    import.meta.env.VITE_SUPABASE_URL &&
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
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
              : links.filter((l) => ["/app", "/app/sales"].includes(l.to))
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
            <div className="local-status">
              <span
                className="live-dot"
                style={{ background: supabaseConfigured ? "#22c55e" : "#f59e0b" }}
              />
              {supabaseConfigured ? "Supabase ready" : "Needs Supabase config"}
              <ShieldCheck size={13} />
            </div>
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
            <ShieldCheck size={19} />
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
    api("/auth/me")
      .then((r) => {
        setUser(r.user);
        document.documentElement.dataset.theme = r.user.theme;
      })
      .catch((e) => {
        if ((e as Error).message !== "Sign in to continue.")
          setAuthError((e as Error).message);
      })
      .finally(() => setReady(true));
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
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={user ? <Navigate to="/app" /> : <Landing />} />
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/app" />
            ) : (
              <Auth register={false} onUser={setUser} />
            )
          }
        />
        <Route
          path="/register"
          element={
            user ? <Navigate to="/app" /> : <Auth register onUser={setUser} />
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

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

async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  const payload = await response.text();
  const json = payload ? JSON.parse(payload) : {};
  if (!response.ok) {
    throw new Error(json.error || json.message || "Request failed.");
  }
  return json as T;
}

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
function AdminConsole({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [overview, setOverview] = useState<null | {
    stats: Record<string, number>;
    users: Array<
      User & {
        business_name?: string;
        branch_name?: string;
        active?: number;
        is_admin?: boolean | number;
      }
    >;
    businesses: Array<Row>;
    recent: Array<Row>;
  }>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminRequest<{
        stats: Record<string, number>;
        users: Array<
          User & {
            business_name?: string;
            branch_name?: string;
            active?: number;
            is_admin?: boolean | number;
          }
        >;
        businesses: Array<Row>;
        recent: Array<Row>;
      }>('/admin/overview');
      setOverview(data);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateUser = async (targetId: string, patch: Record<string, unknown>) => {
    try {
      const result = await adminRequest<{ ok?: boolean }>(`/admin/users/${targetId}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      setStatus(result.ok ? "User updated." : "User saved.");
      await refresh();
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const toggleUser = async (targetId: string) => {
    try {
      await adminRequest<{ ok: boolean }>(`/admin/users/${targetId}/toggle`, {
        method: "POST",
      });
      await refresh();
      setStatus("Access status updated.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const switchToUser = async (targetId: string) => {
    try {
      const result = await adminRequest<{ ok: boolean; user?: User }>(`/admin/users/${targetId}/switch`, {
        method: "POST",
      });
      setStatus(result.ok ? "Switched to this user session." : "Session switched.");
      window.location.assign("/app");
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const data = overview ?? {
    stats: { businesses: 0, users: 0, active: 0, suspended: 0 },
    users: [],
    businesses: [],
    recent: [],
  };

  if (loading && !overview)
    return (
      <div className="app-loading">
        <Logo />
        <div className="loading-line" />
        <p>Loading platform administration…</p>
      </div>
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
          <NavLink to="/admin/users" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <Users size={18} />
            <span>Users</span>
          </NavLink>
          <NavLink to="/admin/businesses" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <Store size={18} />
            <span>Businesses</span>
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
            <span className="breadcrumb">Platform admin <span>/</span> <strong>Console</strong></span>
          </div>
          <div className="topbar-actions">
            <Button variant="ghost" size="icon" aria-label="Refresh admin console" onClick={() => void refresh()}>
              <ArrowUpRight size={18} />
            </Button>
          </div>
        </header>
        <main className="main-content">
          {error && <div className="error" role="alert">{error}</div>}
          {status && <div className="success" role="status">{status}</div>}
          <Routes>
            <Route
              index
              element={
                <div className="admin-grid">
                  <div className="metric-card">
                    <span>Businesses</span>
                    <strong>{data.stats.businesses}</strong>
                  </div>
                  <div className="metric-card">
                    <span>Total users</span>
                    <strong>{data.stats.users}</strong>
                  </div>
                  <div className="metric-card">
                    <span>Active accounts</span>
                    <strong>{data.stats.active}</strong>
                  </div>
                  <div className="metric-card">
                    <span>Suspended</span>
                    <strong>{data.stats.suspended}</strong>
                  </div>
                  <section className="panel">
                    <h3>Recent platform activity</h3>
                    <ul className="list-plain">
                      {data.recent.length ? data.recent.slice(0, 8).map((row) => (
                        <li key={row.id}>
                          <strong>{row.entity || row.category || "Activity"}</strong>
                          <span>{row.description || row.name || "No description"}</span>
                        </li>
                      )) : <li>No recent activity yet.</li>}
                    </ul>
                  </section>
                  <section className="panel">
                    <h3>Businesses</h3>
                    <ul className="list-plain compact">
                      {data.businesses.length ? data.businesses.slice(0, 8).map((business) => (
                        <li key={business.id}>
                          <strong>{business.name}</strong>
                          <span>{business.email || "No contact email"}</span>
                        </li>
                      )) : <li>No businesses found.</li>}
                    </ul>
                  </section>
                </div>
              }
            />
            <Route
              path="users"
              element={
                <section className="panel table-panel">
                  <div className="panel-header">
                    <h3>System users</h3>
                    <Button variant="secondary" onClick={() => void refresh()}>Refresh</Button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Business</th>
                          <th>Role</th>
                          <th>Status</th>
                          <th>Access</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.users.length ? data.users.map((member) => {
                          const nextStatus = member.account_status || "active";
                          const platformAdmin = Boolean(member.is_admin) || member.id === SYSTEM_ADMIN_ID;
                          return (
                            <tr key={member.id}>
                              <td>{member.name}<div className="muted">{member.email}</div></td>
                              <td>{member.business_name || "-"}</td>
                              <td>{member.role}</td>
                              <td>{nextStatus}</td>
                              <td>{platformAdmin ? "Admin" : member.active === 0 ? "Disabled" : "Enabled"}</td>
                              <td>
                                <div className="row-actions">
                                  <Button size="sm" variant="secondary" onClick={() => updateUser(member.id, { account_status: nextStatus === "active" ? "suspended" : "active", active: nextStatus !== "active" })}>Toggle</Button>
                                  <Button size="sm" variant="secondary" onClick={() => updateUser(member.id, { is_admin: !platformAdmin })}>{platformAdmin ? "Remove admin" : "Grant admin"}</Button>
                                  {!platformAdmin && member.id !== user.id && (
                                    <Button size="sm" variant="default" onClick={() => void switchToUser(member.id)}>Use as normal user</Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        }) : <tr><td colSpan={6}>No users found.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              }
            />
            <Route
              path="businesses"
              element={
                <section className="panel table-panel">
                  <div className="panel-header">
                    <h3>Businesses</h3>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Country</th>
                          <th>Currency</th>
                          <th>Members</th>
                          <th>Owners</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.businesses.length ? data.businesses.map((business) => (
                          <tr key={business.id}>
                            <td>{business.name}</td>
                            <td>{business.country || "-"}</td>
                            <td>{business.currency || "TZS"}</td>
                            <td>{business.member_count || 0}</td>
                            <td>{business.owner_count || 0}</td>
                          </tr>
                        )) : <tr><td colSpan={5}>No businesses found.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
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

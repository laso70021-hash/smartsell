import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ClipboardCheck,
  MessageCircle,
  RefreshCw,
  Send,
  Settings2,
  Store,
  Ticket,
  Trash2,
} from "lucide-react";
import {
  currencyScale,
  platformPaymentReviewRequest,
  platformBusinessRequest,
  platformConsoleRequest,
  type PlatformAdminRange,
  type PlatformApplication,
  type PlatformBusinessAccount,
  type PlatformRestaurantOverview,
  type PlatformSettings,
  type PlatformSupportTicket,
  type User,
} from "../lib/api";
import { getSupabase } from "../lib/supabase";
import { Button } from "./ui/button";

type AdminSection = "approvals" | "restaurant-pos" | "support" | "settings";
type BusinessOption = { id: string; name: string };
type SettingsDraft = Omit<
  PlatformSettings,
  "supported_countries" | "supported_currencies" | "business_types"
> & {
  supported_countries: string;
  supported_currencies: string;
  business_types: string;
};

const reviewStatuses = [
  "pending",
  "under_review",
  "needs_documents",
  "approved",
  "rejected",
  "suspended",
] as const;
const supportStatuses = [
  "open",
  "in_progress",
  "waiting_on_business",
  "resolved",
  "closed",
] as const;
const priorities = ["low", "normal", "high", "urgent"] as const;
const categories = [
  "account",
  "billing",
  "inventory",
  "sales",
  "restaurant",
  "technical",
  "other",
] as const;
const rangeOptions: Array<{ value: PlatformAdminRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
];
const defaultSettings: PlatformSettings = {
  site_name: "Smartsell",
  support_email: "",
  support_phone: "",
  website_url: "",
  contact_address: "",
  supported_countries: [],
  supported_currencies: ["TZS", "KES", "UGX"],
  business_types: ["Retail", "Grocery", "Fashion", "Restaurant", "Other"],
};

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dateTime(value: string) {
  return new Date(value).toLocaleString();
}

function Notice({
  error,
  children,
}: {
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <p
      className={`platform-console-notice${error ? " is-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

function ConsoleHeader({
  icon,
  title,
  description,
  onRefresh,
  loading,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <header className="platform-console-heading">
      <div className="platform-console-icon">{icon}</div>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <Button
        variant="secondary"
        disabled={loading}
        onClick={onRefresh}
        aria-label={`Refresh ${title.toLowerCase()}`}
      >
        <RefreshCw size={15} />
        Refresh
      </Button>
    </header>
  );
}

export function BusinessAccountsPage() {
  const [businesses, setBusinesses] = useState<PlatformBusinessAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [editingId, setEditingId] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchValue(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await platformBusinessRequest<{
        businesses: PlatformBusinessAccount[];
      }>("list", { search: searchValue });
      setBusinesses(result.businesses);
      setError("");
    } catch (e) {
      setError(messageOf(e, "Unable to load business accounts."));
    } finally {
      setLoading(false);
    }
  }, [searchValue]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (
    business: PlatformBusinessAccount,
    accountStatus: "active" | "suspended",
    suspensionReason = "",
  ) => {
    setSavingId(business.id);
    setError("");
    setNotice("");
    try {
      await platformBusinessRequest("set_status", {
        business_id: business.id,
        account_status: accountStatus,
        suspension_reason: suspensionReason,
      });
      setEditingId("");
      setReason("");
      setNotice(
        accountStatus === "suspended"
          ? `${business.name} and its active business accounts have been suspended.`
          : `${business.name} has been reactivated.`,
      );
      await load();
    } catch (e) {
      setError(messageOf(e, "Unable to change business account status."));
    } finally {
      setSavingId("");
    }
  };

  const deleteTenant = async (business: PlatformBusinessAccount) => {
    const confirmation = window.prompt(
      `This permanently deletes ${business.name}, all linked business data, and uploaded files. Type the exact business name to continue:`,
    );
    if (confirmation === null) return;
    if (confirmation !== business.name) {
      setError("The business name did not match; nothing was deleted.");
      return;
    }
    if (!window.confirm(
      `Permanently delete ${business.name}? This cannot be undone. Member logins will be blocked.`,
    )) return;

    setSavingId(business.id);
    setError("");
    setNotice("");
    try {
      const { error: deleteError } = await getSupabase().functions.invoke(
        "delete-business-tenant",
        {
          body: {
            action: "delete_tenant",
            business_id: business.id,
            confirmation,
          },
        },
      );
      if (deleteError) {
        let errorMessage = deleteError.message;
        if (deleteError.context instanceof Response) {
          const result = await deleteError.context.json().catch(() => null);
          if (typeof result?.error === "string") errorMessage = result.error;
        }
        throw new Error(errorMessage);
      }
      setEditingId("");
      setNotice(`${business.name} and its linked records were permanently deleted.`);
      await load();
    } catch (e) {
      setError(messageOf(e, "Unable to delete this business."));
    } finally {
      setSavingId("");
    }
  };

  return (
    <div className="admin-operation-page platform-console">
      <ConsoleHeader
        icon={<Store size={20} />}
        title="Business accounts"
        description="Suspend accounts or permanently delete a tenant and its linked business data. Deletion requires typing the exact business name."
        onRefresh={() => void load()}
        loading={loading}
      />
      <section className="panel platform-console-panel">
        <div className="platform-console-toolbar">
          <label>
            <span>Search businesses</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Business, owner, or country"
            />
          </label>
          <span className="platform-console-count">
            {businesses.length} businesses shown
          </span>
        </div>
        {error && <Notice error>{error}</Notice>}
        {notice && <Notice>{notice}</Notice>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Type / country</th>
                <th>Owner</th>
                <th>Members</th>
                <th>Branches</th>
                <th>Registered</th>
                <th>Account access</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {businesses.length ? businesses.map((business) => (
                <Fragment key={business.id}>
                  <tr>
                    <td>{business.name}<div className="muted">{business.currency}</div></td>
                    <td>
                      {business.category === "Other" && business.custom_category
                        ? business.custom_category
                        : business.category}
                      <div className="muted">{business.country}</div>
                    </td>
                    <td>{business.owner_name || "No owner recorded"}</td>
                    <td>
                      {business.active_member_count} active
                      <div className="muted">{business.member_count} total</div>
                    </td>
                    <td>{business.branch_count}</td>
                    <td>{new Date(business.created_at).toLocaleDateString()}</td>
                    <td>
                      <span className={`platform-status status-${business.account_status}`}>
                        {titleCase(business.account_status)}
                      </span>
                      {business.account_status === "suspended" && (
                        <div className="platform-business-reason">
                          {business.suspension_reason}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                      {business.account_status === "active" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={loading || savingId !== ""}
                          onClick={() => {
                            setEditingId((current) =>
                              current === business.id ? "" : business.id,
                            );
                            setReason("");
                          }}
                        >
                          Suspend business
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={loading || savingId !== ""}
                          onClick={() => void setStatus(business, "active")}
                        >
                          {savingId === business.id ? "Reactivating…" : "Reactivate"}
                        </Button>
                      )}
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={loading || savingId !== ""}
                          onClick={() => void deleteTenant(business)}
                        >
                          <Trash2 size={14} />
                          {savingId === business.id ? "Deleting…" : "Delete tenant"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {editingId === business.id && (
                    <tr className="platform-business-editor-row">
                      <td colSpan={8}>
                        <form
                          className="platform-business-editor"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void setStatus(business, "suspended", reason);
                          }}
                        >
                          <label>
                            <span>
                              Suspension reason (the business members will see this)
                            </span>
                            <input
                              required
                              maxLength={2000}
                              value={reason}
                              onChange={(event) => setReason(event.target.value)}
                              placeholder="Explain why access is being suspended"
                            />
                          </label>
                          <Button
                            type="submit"
                            variant="destructive"
                            disabled={savingId === business.id || !reason.trim()}
                          >
                            {savingId === business.id
                              ? "Suspending…"
                              : "Suspend all business access"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={savingId === business.id}
                            onClick={() => setEditingId("")}
                          >
                            Cancel
                          </Button>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )) : (
                <tr>
                  <td colSpan={8}>
                    {loading ? "Loading business accounts…" : "No businesses match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ReviewQueue() {
  const [applications, setApplications] = useState<PlatformApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [editingId, setEditingId] = useState("");
  const [reviewStatus, setReviewStatus] =
    useState<(typeof reviewStatuses)[number]>("under_review");
  const [reason, setReason] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchValue(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, applicationDetails] = await Promise.all([
        platformConsoleRequest<{ applications: PlatformApplication[] }>(
          "approvals_list",
          { status: statusFilter, search: searchValue },
        ),
        platformPaymentReviewRequest<{ applications: PlatformApplication[] }>(
          "applications",
        ),
      ]);
      const detailsByBusiness = new Map(
        applicationDetails.applications.map((application) => [
          application.business_id,
          application,
        ]),
      );
      setApplications(
        result.applications.map((application) => ({
          ...application,
          ...(detailsByBusiness.get(application.business_id) || {}),
        })),
      );
      setError("");
    } catch (e) {
      setError(messageOf(e, "Unable to load business reviews."));
    } finally {
      setLoading(false);
    }
  }, [searchValue, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveReview = async (businessId: string) => {
    setSavingId(businessId);
    setError("");
    setNotice("");
    try {
      await platformConsoleRequest("approval_update", {
        business_id: businessId,
        status: reviewStatus,
        reason,
      });
      setNotice("Review status saved. Business approval is required before subscription access is enabled.");
      setEditingId("");
      await load();
    } catch (e) {
      setError(messageOf(e, "Unable to save the business review."));
    } finally {
      setSavingId("");
    }
  };

  const openApplicationDocument = async (path: string) => {
    const documentWindow = window.open("about:blank", "_blank");
    if (!documentWindow) {
      setError("Allow pop-ups to view this business document.");
      return;
    }
    documentWindow.opener = null;
    try {
      const { data, error: signedUrlError } = await getSupabase()
        .storage.from("business-registration-evidence")
        .createSignedUrl(path, 60);
      if (signedUrlError) throw signedUrlError;
      documentWindow.location.href = data.signedUrl;
    } catch (e) {
      documentWindow.close();
      setError(messageOf(e, "Unable to open this business document."));
    }
  };

  return (
    <div className="platform-console admin-operation-page">
      <ConsoleHeader
        icon={<ClipboardCheck size={20} />}
        title="Business approvals"
        description="Review submitted business details and documents. Approval is required before a new subscription can activate."
        onRefresh={() => void load()}
        loading={loading}
      />
      <section className="panel platform-console-panel">
        <div className="platform-console-toolbar">
          <label>
            <span>Search businesses</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, owner email, or country"
            />
          </label>
          <label>
            <span>Review status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All reviews</option>
              <option value="unreviewed">Unreviewed</option>
              {reviewStatuses.map((status) => (
                <option key={status} value={status}>
                  {titleCase(status)}
                </option>
              ))}
            </select>
          </label>
          <span className="platform-console-count">
            {applications.length} businesses shown
          </span>
        </div>
        {error && <Notice error>{error}</Notice>}
        {notice && <Notice>{notice}</Notice>}
        {loading && !applications.length ? (
          <div className="platform-console-empty">Loading business reviews…</div>
        ) : applications.length ? (
          <div className="platform-review-list">
            {applications.map((application) => (
              <article className="platform-review-card" key={application.business_id}>
                <div className="platform-review-main">
                  <div>
                    <h3>{application.business_name}</h3>
                    <p>
                      {application.category}
                      {application.custom_category
                        ? ` · ${application.custom_category}`
                        : ""}{" "}
                      · {application.country || "Country not recorded"}
                    </p>
                    <p className="platform-review-meta">
                      Plan: {application.plan_name || "Not recorded"} · Region:{" "}
                      {application.region || "Not recorded"}
                    </p>
                    {application.registration_number && (
                      <p className="platform-review-meta">
                        Registration / licence: {application.registration_number}
                      </p>
                    )}
                    <p className="platform-review-meta">
                      Owner: {application.owner_name || "Not recorded"}
                      {application.owner_email
                        ? ` · ${application.owner_email}`
                        : ""}
                    </p>
                    <p className="platform-review-meta">
                      Registered {dateTime(application.created_at)} ·{" "}
                      {application.active_branches} active branches
                    </p>
                  </div>
                  <span className={`platform-status status-${application.status}`}>
                    {titleCase(application.status)}
                  </span>
                </div>
                {(application.address || application.email || application.phone || application.tax_id) && (
                  <div className="platform-review-contact">
                    {application.address && <span>{application.address}</span>}
                    {application.email && <span>{application.email}</span>}
                    {application.phone && <span>{application.phone}</span>}
                    {application.tax_id && <span>Tax ID: {application.tax_id}</span>}
                  </div>
                )}
                {application.reason && (
                  <p className="platform-review-reason">
                    <strong>Review note:</strong> {application.reason}
                  </p>
                )}
                {application.documents?.length ? (
                  <div className="platform-review-documents">
                    <strong>Submitted documents</strong>
                    {application.documents.map((path) => (
                      <Button
                        key={path}
                        size="sm"
                        variant="secondary"
                        onClick={() => void openApplicationDocument(path)}
                      >
                        View {path.split("/").at(-1)}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="platform-review-meta">
                    No business documents submitted yet.
                  </p>
                )}
                <div className="platform-console-actions">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingId(application.business_id);
                      setReviewStatus(
                        application.status === "unreviewed"
                          ? "under_review"
                          : reviewStatuses.includes(
                                application.status as (typeof reviewStatuses)[number],
                              )
                            ? (application.status as (typeof reviewStatuses)[number])
                            : "under_review",
                      );
                      setReason(application.reason);
                    }}
                  >
                    Review business
                  </Button>
                </div>
                {editingId === application.business_id && (
                  <form
                    className="platform-review-editor"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveReview(application.business_id);
                    }}
                  >
                    <label>
                      <span>Review status</span>
                      <select
                        value={reviewStatus}
                        onChange={(event) =>
                          setReviewStatus(
                            event.target.value as (typeof reviewStatuses)[number],
                          )
                        }
                      >
                        {reviewStatuses.map((status) => (
                          <option key={status} value={status}>
                            {titleCase(status)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="platform-field-grow">
                      <span>Review note or follow-up request</span>
                      <input
                        maxLength={2000}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Optional internal note"
                      />
                    </label>
                    <Button type="submit" disabled={savingId === application.business_id}>
                      <Check size={15} />
                      {savingId === application.business_id ? "Saving…" : "Save review"}
                    </Button>
                  </form>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="platform-console-empty">
            {loading ? "Loading business reviews…" : "No businesses match this review filter."}
          </div>
        )}
      </section>
    </div>
  );
}

function formatCurrency(minorAmount: number, currency: string) {
  const scale = currencyScale(currency);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: scale,
    }).format(Number(minorAmount) / 10 ** scale);
  } catch {
    return `${currency} ${(Number(minorAmount) / 10 ** scale).toLocaleString()}`;
  }
}

function RestaurantOversight() {
  const [data, setData] = useState<PlatformRestaurantOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<PlatformAdminRange>("30d");
  const [search, setSearch] = useState("");
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchValue(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await platformConsoleRequest<PlatformRestaurantOverview>(
        "restaurant_pos",
        { range, search: searchValue },
      );
      setData(result);
      setError("");
    } catch (e) {
      setError(messageOf(e, "Unable to load restaurant and POS activity."));
    } finally {
      setLoading(false);
    }
  }, [range, searchValue]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeOrders = useMemo(
    () =>
      (data?.orders_by_status || [])
        .filter((item) =>
          ["open", "submitted", "preparing", "ready", "served"].includes(
            item.status,
          ),
        )
        .reduce((total, item) => total + Number(item.count), 0),
    [data?.orders_by_status],
  );
  const totalOrders = useMemo(
    () =>
      (data?.orders_by_status || []).reduce(
        (total, item) => total + Number(item.count),
        0,
      ),
    [data?.orders_by_status],
  );

  return (
    <div className="platform-console admin-operation-page">
      <ConsoleHeader
        icon={<Store size={20} />}
        title="Restaurant & POS"
        description="Read-only platform oversight for restaurant setup, kitchen activity, and completed POS sales."
        onRefresh={() => void load()}
        loading={loading}
      />
      <section className="panel platform-console-panel">
        <div className="platform-console-toolbar">
          <label className="platform-field-grow">
            <span>Search restaurants, branches, or order references</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search platform restaurant data"
            />
          </label>
          <label>
            <span>Date range</span>
            <select
              value={range}
              onChange={(event) =>
                setRange(event.target.value as PlatformAdminRange)
              }
            >
              {rangeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <Notice error>{error}</Notice>}
        <div className="platform-console-stats">
          <div><span>Restaurants</span><strong>{data?.restaurants.length ?? "—"}</strong></div>
          <div><span>Active orders</span><strong>{activeOrders.toLocaleString()}</strong></div>
          <div><span>Orders in period</span><strong>{totalOrders.toLocaleString()}</strong></div>
          <div><span>Kitchen stations</span><strong>{(data?.restaurants || []).reduce((sum, item) => sum + Number(item.kitchen_stations), 0).toLocaleString()}</strong></div>
        </div>
        <div className="platform-console-subheading">
          <h3>Restaurant operations</h3>
          <span>{loading ? "Refreshing…" : "Configuration counts and current open orders"}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Restaurant</th>
                <th>Country</th>
                <th>Branches</th>
                <th>Tables</th>
                <th>Kitchen stations</th>
                <th>Open orders</th>
              </tr>
            </thead>
            <tbody>
              {data?.restaurants.length ? data.restaurants.map((restaurant) => (
                <tr key={restaurant.id}>
                  <td>{restaurant.name}</td>
                  <td>{restaurant.country || "—"}</td>
                  <td>{restaurant.branches}</td>
                  <td>{restaurant.dining_tables}</td>
                  <td>{restaurant.kitchen_stations}</td>
                  <td>{restaurant.open_orders}</td>
                </tr>
              )) : (
                <tr><td colSpan={6}>{loading ? "Loading restaurant data…" : "No restaurant businesses found."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="platform-console-subheading">
          <h3>Recent restaurant orders</h3>
          <span>Latest 100 orders in the selected period</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Business / branch</th>
                <th>Table</th>
                <th>Items</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data?.orders.length ? data.orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.reference}</td>
                  <td>{order.business_name}<div className="muted">{order.branch_name}</div></td>
                  <td>{order.table_name || "—"}</td>
                  <td>{order.item_count}</td>
                  <td><span className={`platform-status status-${order.status}`}>{titleCase(order.status)}</span></td>
                  <td>{dateTime(order.created_at)}</td>
                </tr>
              )) : (
                <tr><td colSpan={6}>{loading ? "Loading restaurant orders…" : "No restaurant orders in this period."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="platform-console-subheading">
          <h3>Completed POS sales</h3>
          <span>Totals are grouped by each restaurant’s currency</span>
        </div>
        <div className="platform-console-currency-list">
          {data?.sales_by_currency.length ? data.sales_by_currency.map((item) => (
            <div key={item.currency}>
              <span>{item.currency}</span>
              <strong>{formatCurrency(item.total, item.currency)}</strong>
              <small>{item.count} completed sales</small>
            </div>
          )) : (
            <p className="platform-console-empty">
              {loading ? "Loading sales totals…" : "No completed restaurant sales in this period."}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function SupportInbox({
  businesses,
  adminId,
}: {
  businesses: BusinessOption[];
  adminId: string;
}) {
  const [tickets, setTickets] = useState<PlatformSupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [reply, setReply] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    business_id: "",
    subject: "",
    category: "technical",
    priority: "normal",
    message: "",
  });
  const selected = tickets.find((ticket) => ticket.id === selectedId) || null;

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchValue(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setDraft((current) => ({
      ...current,
      business_id: current.business_id || businesses[0]?.id || "",
    }));
  }, [businesses]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await platformConsoleRequest<{
        tickets: PlatformSupportTicket[];
      }>("support_list", { status: statusFilter, search: searchValue });
      setTickets(result.tickets);
      setSelectedId((current) =>
        result.tickets.some((ticket) => ticket.id === current)
          ? current
          : result.tickets[0]?.id || "",
      );
      setError("");
    } catch (e) {
      setError(messageOf(e, "Unable to load support tickets."));
    } finally {
      setLoading(false);
    }
  }, [searchValue, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const createTicket = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await platformConsoleRequest("support_create", draft);
      setDraft((current) => ({
        ...current,
        subject: "",
        message: "",
      }));
      setCreating(false);
      setNotice("Support ticket created.");
      await load();
    } catch (e) {
      setError(messageOf(e, "Unable to create the support ticket."));
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await platformConsoleRequest("support_reply", {
        ticket_id: selected.id,
        message: reply,
      });
      setReply("");
      setNotice("Reply sent.");
      await load();
    } catch (e) {
      setError(messageOf(e, "Unable to send the support reply."));
    } finally {
      setBusy(false);
    }
  };

  const updateTicket = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await platformConsoleRequest("support_update", {
        ticket_id: selected.id,
        status: String(formData.get("status")),
        priority: String(formData.get("priority")),
        resolution_note: String(formData.get("resolution_note") || ""),
        assigned_admin: formData.get("assigned") === "me" ? adminId : "",
      });
      setNotice("Ticket details updated.");
      await load();
    } catch (e) {
      setError(messageOf(e, "Unable to update the support ticket."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="platform-console admin-operation-page">
      <ConsoleHeader
        icon={<Ticket size={20} />}
        title="Support inbox"
        description="Track tenant requests, reply in context, and manage ticket status and assignment."
        onRefresh={() => void load()}
        loading={loading}
      />
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      <div className="platform-support-layout">
        <section className="panel platform-console-panel platform-support-list-panel">
          <div className="platform-console-toolbar">
            <label>
              <span>Search tickets</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Subject, category, or business"
              />
            </label>
            <label>
              <span>Ticket status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All tickets</option>
                {supportStatuses.map((status) => (
                  <option key={status} value={status}>
                    {titleCase(status)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button
            variant="secondary"
            className="platform-full-button"
            onClick={() => setCreating((value) => !value)}
          >
            <MessageCircle size={16} />
            {creating ? "Hide ticket form" : "Create ticket for a business"}
          </Button>
          {creating && (
            <form className="platform-console-form" onSubmit={(event) => void createTicket(event)}>
              <label>
                <span>Business</span>
                <select
                  required
                  value={draft.business_id}
                  onChange={(event) =>
                    setDraft({ ...draft, business_id: event.target.value })
                  }
                >
                  <option value="">Select a business</option>
                  {businesses.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="platform-form-grid">
                <label>
                  <span>Category</span>
                  <select
                    value={draft.category}
                    onChange={(event) =>
                      setDraft({ ...draft, category: event.target.value })
                    }
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>{titleCase(category)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Priority</span>
                  <select
                    value={draft.priority}
                    onChange={(event) =>
                      setDraft({ ...draft, priority: event.target.value })
                    }
                  >
                    {priorities.map((priority) => (
                      <option key={priority} value={priority}>{titleCase(priority)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                <span>Subject</span>
                <input
                  required
                  maxLength={200}
                  value={draft.subject}
                  onChange={(event) =>
                    setDraft({ ...draft, subject: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Initial message</span>
                <textarea
                  required
                  maxLength={5000}
                  rows={3}
                  value={draft.message}
                  onChange={(event) =>
                    setDraft({ ...draft, message: event.target.value })
                  }
                />
              </label>
              <Button type="submit" disabled={busy || !draft.business_id}>
                {busy ? "Creating…" : "Create ticket"}
              </Button>
            </form>
          )}
          <div className="platform-ticket-list">
            {tickets.length ? tickets.map((ticket) => (
              <button
                className={`platform-ticket-item${ticket.id === selectedId ? " is-selected" : ""}`}
                key={ticket.id}
                onClick={() => setSelectedId(ticket.id)}
              >
                <span className="platform-ticket-title">{ticket.subject}</span>
                <span>{ticket.business_name}</span>
                <span className="platform-ticket-item-meta">
                  <span className={`platform-status status-${ticket.status}`}>
                    {titleCase(ticket.status)}
                  </span>
                  <span>{dateTime(ticket.updated_at)}</span>
                </span>
              </button>
            )) : (
              <div className="platform-console-empty">
                {loading ? "Loading tickets…" : "No support tickets match this filter."}
              </div>
            )}
          </div>
        </section>
        <section className="panel platform-console-panel platform-support-detail">
          {selected ? (
            <>
              <div className="platform-support-detail-heading">
                <div>
                  <span className="platform-console-eyebrow">{selected.business_name}</span>
                  <h3>{selected.subject}</h3>
                  <p>{titleCase(selected.category)} · Opened {dateTime(selected.created_at)}</p>
                </div>
                <span className={`platform-status status-${selected.priority}`}>
                  {titleCase(selected.priority)}
                </span>
              </div>
              <div className="platform-ticket-messages">
                {selected.messages.map((item) => (
                  <article
                    key={item.id}
                    className={`platform-ticket-message${item.actor_id === adminId ? " is-admin" : ""}`}
                  >
                    <div><strong>{item.actor_name}</strong><time>{dateTime(item.created_at)}</time></div>
                    <p>{item.body}</p>
                  </article>
                ))}
              </div>
              {selected.status !== "closed" && selected.status !== "resolved" && (
                <form className="platform-ticket-reply" onSubmit={(event) => void sendReply(event)}>
                  <label>
                    <span>Reply to business</span>
                    <textarea
                      required
                      maxLength={5000}
                      rows={3}
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      placeholder="Write a response…"
                    />
                  </label>
                  <Button type="submit" disabled={busy}>
                    <Send size={15} />
                    {busy ? "Sending…" : "Send reply"}
                  </Button>
                </form>
              )}
              <form className="platform-ticket-management" onSubmit={(event) => void updateTicket(event)}>
                <label>
                  <span>Status</span>
                  <select name="status" defaultValue={selected.status} key={`${selected.id}-${selected.status}`}>
                    {supportStatuses.map((status) => (
                      <option key={status} value={status}>{titleCase(status)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Priority</span>
                  <select name="priority" defaultValue={selected.priority} key={`${selected.id}-${selected.priority}`}>
                    {priorities.map((priority) => (
                      <option key={priority} value={priority}>{titleCase(priority)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Assignment</span>
                  <select
                    name="assigned"
                    defaultValue={selected.assigned_admin === adminId ? "me" : ""}
                    key={`${selected.id}-${selected.assigned_admin || "none"}`}
                  >
                    <option value="">Unassigned</option>
                    <option value="me">Assign to me</option>
                  </select>
                </label>
                <label className="platform-field-grow">
                  <span>Resolution note</span>
                  <input
                    name="resolution_note"
                    maxLength={2000}
                    defaultValue={selected.resolution_note}
                    key={`${selected.id}-${selected.resolution_note}`}
                  />
                </label>
                <Button type="submit" variant="secondary" disabled={busy}>
                  Save ticket
                </Button>
              </form>
            </>
          ) : (
            <div className="platform-console-empty">
              {loading ? "Loading ticket details…" : "Select a ticket to read and reply."}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function PlatformSettingsPage() {
  const [draft, setDraft] = useState<SettingsDraft>({
    ...defaultSettings,
    supported_countries: "",
    supported_currencies: defaultSettings.supported_currencies.join(", "),
    business_types: defaultSettings.business_types.join(", "),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await platformConsoleRequest<{
        settings: Partial<PlatformSettings>;
      }>("settings_get");
      const settings = { ...defaultSettings, ...result.settings };
      setDraft({
        site_name: settings.site_name,
        support_email: settings.support_email,
        support_phone: settings.support_phone,
        website_url: settings.website_url,
        contact_address: settings.contact_address,
        supported_countries: settings.supported_countries.join(", "),
        supported_currencies: settings.supported_currencies.join(", "),
        business_types: settings.business_types.join(", "),
      });
      setError("");
    } catch (e) {
      setError(messageOf(e, "Unable to load platform settings."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const list = (value: string) =>
      [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
    try {
      await platformConsoleRequest("settings_save", {
        settings: {
          site_name: draft.site_name.trim(),
          support_email: draft.support_email.trim(),
          support_phone: draft.support_phone.trim(),
          website_url: draft.website_url.trim(),
          contact_address: draft.contact_address.trim(),
          supported_countries: list(draft.supported_countries),
          supported_currencies: list(draft.supported_currencies),
          business_types: list(draft.business_types),
        },
      });
      setNotice("Platform settings saved.");
    } catch (e) {
      setError(messageOf(e, "Unable to save platform settings."));
    } finally {
      setSaving(false);
    }
  };

  const setField = (field: keyof SettingsDraft, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  return (
    <div className="platform-console admin-operation-page">
      <ConsoleHeader
        icon={<Settings2 size={20} />}
        title="Platform settings"
        description="Manage public contact details and supported signup options. Provider credentials are intentionally not stored here."
        onRefresh={() => void load()}
        loading={loading}
      />
      <section className="panel platform-console-panel platform-settings-panel">
        {error && <Notice error>{error}</Notice>}
        {notice && <Notice>{notice}</Notice>}
        {loading ? (
          <div className="platform-console-empty">Loading platform settings…</div>
        ) : (
          <form className="platform-settings-form" onSubmit={(event) => void save(event)}>
            <div className="platform-form-grid">
              <label>
                <span>Platform name</span>
                <input
                  required
                  maxLength={80}
                  value={draft.site_name}
                  onChange={(event) => setField("site_name", event.target.value)}
                />
              </label>
              <label>
                <span>Support email</span>
                <input
                  type="email"
                  maxLength={300}
                  value={draft.support_email}
                  onChange={(event) => setField("support_email", event.target.value)}
                />
              </label>
              <label>
                <span>Support phone</span>
                <input
                  maxLength={300}
                  value={draft.support_phone}
                  onChange={(event) => setField("support_phone", event.target.value)}
                />
              </label>
              <label>
                <span>Website URL</span>
                <input
                  type="url"
                  maxLength={300}
                  value={draft.website_url}
                  onChange={(event) => setField("website_url", event.target.value)}
                  placeholder="https://example.com"
                />
              </label>
              <label className="platform-field-full">
                <span>Contact address</span>
                <input
                  maxLength={300}
                  value={draft.contact_address}
                  onChange={(event) => setField("contact_address", event.target.value)}
                />
              </label>
              <label className="platform-field-full">
                <span>Supported countries</span>
                <textarea
                  rows={2}
                  value={draft.supported_countries}
                  onChange={(event) => setField("supported_countries", event.target.value)}
                  placeholder="Kenya, Tanzania, Uganda"
                />
                <small>Comma-separated values; leave blank to avoid restricting signup by country.</small>
              </label>
              <label className="platform-field-full">
                <span>Supported currencies</span>
                <textarea
                  rows={2}
                  value={draft.supported_currencies}
                  onChange={(event) => setField("supported_currencies", event.target.value)}
                  placeholder="TZS, KES, UGX"
                />
              </label>
              <label className="platform-field-full">
                <span>Business types</span>
                <textarea
                  rows={2}
                  value={draft.business_types}
                  onChange={(event) => setField("business_types", event.target.value)}
                  placeholder="Retail, Grocery, Restaurant"
                />
              </label>
            </div>
            <div className="platform-settings-actions">
              <p>These values are stored in the private platform settings table. Payment provider secrets and service credentials are not editable in this browser.</p>
              <Button type="submit" disabled={saving}>
                <Check size={15} />
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

export function PlatformAdminConsolePage({
  section,
  businesses,
  adminId,
}: {
  section: AdminSection;
  businesses: BusinessOption[];
  adminId: string;
}) {
  if (section === "approvals") return <ReviewQueue />;
  if (section === "restaurant-pos") return <RestaurantOversight />;
  if (section === "support")
    return <SupportInbox businesses={businesses} adminId={adminId} />;
  return <PlatformSettingsPage />;
}

export function WorkspaceSupportPage({ businessName }: { businessName: string }) {
  const [tickets, setTickets] = useState<PlatformSupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [reply, setReply] = useState("");
  const [draft, setDraft] = useState({
    subject: "",
    category: "technical",
    priority: "normal",
    message: "",
  });
  const selected = tickets.find((ticket) => ticket.id === selectedId) || null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await platformConsoleRequest<{
        tickets: PlatformSupportTicket[];
      }>("support_my_tickets");
      setTickets(result.tickets);
      setSelectedId((current) =>
        result.tickets.some((ticket) => ticket.id === current)
          ? current
          : result.tickets[0]?.id || "",
      );
      setError("");
    } catch (e) {
      setError(messageOf(e, "Unable to load your support requests."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createTicket = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await platformConsoleRequest("support_open", draft);
      setDraft({
        subject: "",
        category: "technical",
        priority: "normal",
        message: "",
      });
      setCreating(false);
      setNotice("Your support request has been sent.");
      await load();
    } catch (e) {
      setError(messageOf(e, "Unable to submit your support request."));
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await platformConsoleRequest("support_customer_reply", {
        ticket_id: selected.id,
        message: reply,
      });
      setReply("");
      setNotice("Your reply has been sent.");
      await load();
    } catch (e) {
      setError(messageOf(e, "Unable to send your reply."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="platform-console workspace-support-page">
      <ConsoleHeader
        icon={<MessageCircle size={20} />}
        title="Support"
        description={`Support requests for ${businessName}. Messages are visible to your business workspace and the Smartsell support team.`}
        onRefresh={() => void load()}
        loading={loading}
      />
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      <div className="platform-support-layout">
        <section className="panel platform-console-panel platform-support-list-panel">
          <div className="platform-console-subheading">
            <h3>Your requests</h3>
            <Button
              variant="secondary"
              onClick={() => setCreating((value) => !value)}
            >
              <MessageCircle size={15} />
              {creating ? "Cancel" : "New request"}
            </Button>
          </div>
          {creating && (
            <form className="platform-console-form" onSubmit={(event) => void createTicket(event)}>
              <label>
                <span>Category</span>
                <select
                  value={draft.category}
                  onChange={(event) =>
                    setDraft({ ...draft, category: event.target.value })
                  }
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>{titleCase(category)}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Subject</span>
                <input
                  required
                  maxLength={200}
                  value={draft.subject}
                  onChange={(event) =>
                    setDraft({ ...draft, subject: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Message</span>
                <textarea
                  required
                  maxLength={5000}
                  rows={4}
                  value={draft.message}
                  onChange={(event) =>
                    setDraft({ ...draft, message: event.target.value })
                  }
                />
              </label>
              <Button type="submit" disabled={busy}>
                <Send size={15} />
                {busy ? "Sending…" : "Submit request"}
              </Button>
            </form>
          )}
          <div className="platform-ticket-list">
            {tickets.length ? tickets.map((ticket) => (
              <button
                className={`platform-ticket-item${ticket.id === selectedId ? " is-selected" : ""}`}
                key={ticket.id}
                onClick={() => setSelectedId(ticket.id)}
              >
                <span className="platform-ticket-title">{ticket.subject}</span>
                <span>{titleCase(ticket.category)}</span>
                <span className="platform-ticket-item-meta">
                  <span className={`platform-status status-${ticket.status}`}>
                    {titleCase(ticket.status)}
                  </span>
                  <span>{dateTime(ticket.updated_at)}</span>
                </span>
              </button>
            )) : (
              <div className="platform-console-empty">
                {loading ? "Loading support requests…" : "No support requests yet."}
              </div>
            )}
          </div>
        </section>
        <section className="panel platform-console-panel platform-support-detail">
          {selected ? (
            <>
              <div className="platform-support-detail-heading">
                <div>
                  <span className="platform-console-eyebrow">{titleCase(selected.status)}</span>
                  <h3>{selected.subject}</h3>
                  <p>{titleCase(selected.category)} · Updated {dateTime(selected.updated_at)}</p>
                </div>
              </div>
              <div className="platform-ticket-messages">
                {selected.messages.map((item) => (
                  <article className="platform-ticket-message" key={item.id}>
                    <div><strong>{item.actor_name}</strong><time>{dateTime(item.created_at)}</time></div>
                    <p>{item.body}</p>
                  </article>
                ))}
              </div>
              {selected.resolution_note && (
                <Notice>Resolution note: {selected.resolution_note}</Notice>
              )}
              {selected.status !== "closed" && selected.status !== "resolved" ? (
                <form className="platform-ticket-reply" onSubmit={(event) => void sendReply(event)}>
                  <label>
                    <span>Send a message</span>
                    <textarea
                      required
                      maxLength={5000}
                      rows={3}
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      placeholder="Add details or reply to support…"
                    />
                  </label>
                  <Button type="submit" disabled={busy}>
                    <Send size={15} />
                    {busy ? "Sending…" : "Send reply"}
                  </Button>
                </form>
              ) : (
                <p className="platform-console-empty">This request is closed. Open a new request if you need more help.</p>
              )}
            </>
          ) : (
            <div className="platform-console-empty">
              {loading ? "Loading request details…" : "Select a request or open a new one."}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

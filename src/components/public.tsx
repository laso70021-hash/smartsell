import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Box,
  BarChart3,
  ShoppingBag,
  Store,
  Users,
  ShieldCheck,
  Layers,
  ChevronDown,
  MoveUpRight,
  CreditCard,
  FileCheck2,
  TriangleAlert,
} from "lucide-react";
import { Logo, Fields, Form } from "./shared";
import { Button } from "./ui/button";
import {
  api,
  businessCategories,
  currencyOptions,
  countryOptions,
  DEFAULT_CURRENCY,
  signupPlans,
  subscriptionPortalRequest,
  type SubscriptionPortal,
  currencyScale,
  type SignupPlan,
  type User,
} from "../lib/api";
import { getSupabase } from "../lib/supabase";
const features = [
  {
    icon: ShoppingBag,
    title: "A smoother checkout",
    text: "Find products, build a cart and issue a receipt. Every sale keeps your stock in sync.",
  },
  {
    icon: Box,
    title: "Inventory, under control",
    text: "Know what is on the shelf, what is running low, and what needs to be reordered.",
  },
  {
    icon: BarChart3,
    title: "Clarity behind every number",
    text: "Follow sales, costs and margins with reports built from your own transactions.",
  },
  {
    icon: Store,
    title: "Room to grow",
    text: "Manage locations in one workspace, with inventory and reporting for each branch.",
  },
  {
    icon: Users,
    title: "Better business relationships",
    text: "Keep customers, suppliers, credit sales and outstanding payments connected.",
  },
  {
    icon: ShieldCheck,
    title: "The right access for your team",
    text: "Give owners, managers and cashiers the tools and access their role needs.",
  },
];
export function Landing() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <Link to="/" aria-label="Smartsell home">
          <Logo />
        </Link>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#workflow">How it works</a>
          <a href="#faq">FAQs</a>
        </div>
        <div className="row">
          <Link to="/login" className="signin-link">
            Sign in
          </Link>
          <Button asChild>
            <Link to="/register">
              Get started <ArrowUpRight size={16} />
            </Link>
          </Button>
        </div>
      </nav>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-label">
              <span className="live-dot" /> BUILT FOR THE EVERYDAY BUSINESS
            </div>
            <h1>
              Big ambitions.
              <br />
              Smarter <span>retail.</span>
            </h1>
            <p>
              From your first sale to your next branch. Bring your inventory,
              sales and people together in one beautifully simple workspace.
            </p>
            <div className="hero-cta">
              <Button asChild>
                <Link to="/register">
                  Start your business workspace <ArrowRight size={18} />
                </Link>
              </Button>
              <a href="#features" className="text-link">
                Take a closer look <MoveUpRight size={16} />
              </a>
            </div>
            <div className="hero-checks">
              <span>
                <Check /> No demo records
              </span>
              <span>
                <Check /> Your data, your business
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="visual-grid" />
            <div className="product-window">
              <div className="window-bar">
                <span />
                <span />
                <span />
                <small>YOUR BUSINESS. CONNECTED.</small>
              </div>
              <div className="window-body">
                <div className="mini-sidebar">
                  <Logo small />
                  {[Box, BarChart3, ShoppingBag, Users, Store].map(
                    (Icon, i) => (
                      <span className={i === 0 ? "selected" : ""} key={i}>
                        <Icon size={17} />
                      </span>
                    ),
                  )}
                </div>
                <div className="mini-main">
                  <div className="row between">
                    <span className="mini-greeting">
                      Your business overview
                    </span>
                    <span className="tiny-badge">All in one place</span>
                  </div>
                  <h3>A clearer view. A better day.</h3>
                  <div className="mini-metrics">
                    <div>
                      <Box size={18} />
                      <span>Inventory</span>
                      <strong>Stay stocked.</strong>
                    </div>
                    <div>
                      <ShoppingBag size={18} />
                      <span>Point of sale</span>
                      <strong>Keep moving.</strong>
                    </div>
                  </div>
                  <div className="illustration-chart">
                    <div>
                      <span>FROM THE FIRST SALE</span>
                      <h4>Built for your next chapter.</h4>
                    </div>
                    <div className="abstract-bars">
                      {[28, 40, 32, 60, 49, 72, 64, 86, 100, 90, 114, 132].map(
                        (h, i) => (
                          <i key={i} style={{ height: h }} />
                        ),
                      )}
                    </div>
                    <small>Product illustration · not business data</small>
                  </div>
                  <div className="mini-bottom">
                    <span>
                      <span className="live-dot" /> Sales + stock + people
                    </span>
                    <Layers size={17} />
                  </div>
                </div>
              </div>
            </div>
            <div className="floating-card">
              <span className="float-icon">
                <Check size={20} />
              </span>
              <div>
                <strong>Everything, in sync.</strong>
                <small>One sale. Every record updated.</small>
              </div>
            </div>
            <span className="visual-caption">
              LESS BUSYWORK. MORE BUSINESS.
            </span>
          </div>
        </section>
        <section className="feature-section" id="features">
          <div className="section-heading">
            <div>
              <span className="eyebrow">ONE CONNECTED WORKSPACE</span>
              <h2>
                All the moving parts.
                <br />
                One clear picture.
              </h2>
            </div>
            <p>
              Practical tools for the work you do every day.
              <br />
              Built to work better together.
            </p>
          </div>
          <div className="feature-grid">
            {features.map((f) => (
              <article key={f.title}>
                <span className="feature-icon">
                  <f.icon size={23} />
                </span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="workflow-section" id="workflow">
          <div>
            <span className="eyebrow">START SIMPLE. GROW CONFIDENTLY.</span>
            <h2>
              Your next chapter
              <br />
              starts right here.
            </h2>
            <p>
              Set up your business, add your products, and make your first sale.
              Your workspace grows with you.
            </p>
            <Button asChild>
              <Link to="/register">
                Let’s get to business <ArrowRight size={17} />
              </Link>
            </Button>
          </div>
          <div className="steps">
            {[
              "Make it yours|Create your business and choose your currency and branch.",
              "Stock your shelves|Add products, set prices and record your opening inventory.",
              "Open for business|Make sales and follow the results in your dashboard.",
            ].map((s, i) => (
              <div key={s}>
                <span>0{i + 1}</span>
                <div>
                  <h3>{s.split("|")[0]}</h3>
                  <p>{s.split("|")[1]}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section id="faq" className="faq-section">
          <h2>A few things to know.</h2>
          {[
            [
              "Does the workspace start with sample data?",
              "No. Your business starts empty. Add your own products and contacts; all dashboard figures come from your saved records.",
            ],
            [
              "Can I use Smartsell across branches?",
              "Yes. Owners can create branches, switch locations and manage each branch’s inventory. Staff access is restricted to their assigned branch.",
            ],
            [
              "Are online payments available?",
              "This local edition records cash payments and customer credit. Payment gateways, subscription billing and email services require a separate integration.",
            ],
            [
              "Where is my data stored?",
              "This edition saves business records in a SQLite database on the computer running the server. Keep backups of the data folder.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <ChevronDown size={18} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
      </main>
      <footer className="landing-footer">
        <Logo />
        <span>Thoughtful tools. Better business.</span>
        <span>© {new Date().getFullYear()} Smartsell</span>
      </footer>
    </div>
  );
}

export function SubscriptionStatus({
  user,
  onUser,
  onLogout,
}: {
  user: User;
  onUser: (user: User) => void;
  onLogout: () => void;
}) {
  const [portal, setPortal] = useState<SubscriptionPortal | null>(null);
  const [plans, setPlans] = useState<SignupPlan[]>([]);
  const [planId, setPlanId] = useState(user.selected_plan_id || "");
  const [method, setMethod] = useState("mobile_money");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [documents, setDocuments] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const reload = async () => {
    setLoading(true);
    try {
      const [nextPortal, nextPlans] = await Promise.all([
        subscriptionPortalRequest<SubscriptionPortal>("status"),
        signupPlans(),
      ]);
      setPortal(nextPortal);
      setPlans(nextPlans);
      setPlanId((current) => current || nextPortal.selected_plan_id || "");
      setError("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load subscription status.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const subscription = portal?.subscription;
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const periodExpired = Boolean(
    subscription?.current_period_end &&
      new Date(subscription.current_period_end).getTime() <= Date.now(),
  );
  const trialExpired = Boolean(
    subscription?.trial_end && new Date(subscription.trial_end).getTime() <= Date.now(),
  );
  const trialActive = subscription?.status === "trialing" && !trialExpired;
  const paidActive = subscription?.status === "active" && !periodExpired;
  const trialUsed = Boolean(portal?.free_trial_used);
  const needsRenewal =
    portal?.business_review_status === "approved" &&
    !trialActive &&
    !paidActive;
  const currency = subscription?.currency || selectedPlan?.currency || "TZS";
  const amount = subscription?.amount ?? selectedPlan?.amount ?? 0;
  const reviewStatus = portal?.business_review_status || user.business_review_status;

  const choosePlan = async () => {
    if (!selectedPlan) {
      setError("Select an available plan.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await subscriptionPortalRequest("select_plan", { plan_id: selectedPlan.id });
      setMessage("Plan selected. Submit payment evidence to activate your workspace.");
      await reload();
      const identity = await api("/auth/me");
      onUser(identity.user);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to select this plan.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submitPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!subscription?.id || !evidence) {
      setError("Select a receipt or payment evidence file.");
      return;
    }
    if (evidence.size > 10 * 1024 * 1024) {
      setError("Choose a payment evidence file smaller than 10 MiB.");
      return;
    }
    if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(evidence.type)) {
      setError("Payment evidence must be a PDF, JPEG, PNG, or WebP file.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const safeName = evidence.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${user.business_id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await getSupabase()
        .storage.from("business-payment-evidence")
        .upload(path, evidence, {
          contentType: evidence.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      await subscriptionPortalRequest("submit_payment", {
        method,
        external_reference: reference,
        evidence_path: path,
        note,
      });
      setEvidence(null);
      setReference("");
      setNote("");
      setMessage("Your payment has been submitted and is awaiting verification.");
      await reload();
      const identity = await api("/auth/me");
      onUser(identity.user);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to submit payment evidence.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submitDocuments = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!documents.length) {
      setError("Select at least one required business document.");
      return;
    }
    if (documents.length > 10 || documents.some((file) => file.size > 20 * 1024 * 1024)) {
      setError("Choose up to 10 documents, each smaller than 20 MiB.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const client = getSupabase();
      const paths: string[] = [];
      for (const file of documents) {
        if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          throw new Error("Business documents must be PDF, JPEG, PNG, or WebP files.");
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${user.id}/${user.business_id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await client
          .storage.from("business-registration-evidence")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        paths.push(path);
      }
      await subscriptionPortalRequest("submit_documents", { documents: paths });
      setDocuments([]);
      setMessage("Business documents submitted for review.");
      await reload();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to submit business documents.",
      );
    } finally {
      setBusy(false);
    }
  };

  const instructions = Object.entries(portal?.payment_instructions || {});

  return (
    <main className="business-suspension-screen subscription-status-screen">
      <section className="business-suspension-card subscription-status-card">
        <Logo />
        <p className="eyebrow">SUBSCRIPTION STATUS</p>
        <h1>
          {reviewStatus === "pending" || reviewStatus === "under_review"
            ? "Your business application is under review."
            : reviewStatus === "needs_documents"
              ? "Additional business documents are required."
              : reviewStatus === "rejected"
                ? "Your business application was not approved."
                : trialActive
                  ? "Your free trial is active."
                  : paidActive
                    ? "Your subscription is active."
                    : trialExpired
                      ? "Your free trial has expired."
                      : subscription?.status === "payment_submitted" ||
                          subscription?.status === "payment_review"
                        ? "Payment verification is in progress."
                        : "Your business has been approved."}
        </h1>
        <p>
          {reviewStatus !== "approved"
            ? "Workspace access will be enabled after your business application is approved."
            : trialActive
              ? `Your free trial is available until ${new Date(subscription?.trial_end || "").toLocaleString()}.`
              : paidActive
                ? `Your ${subscription?.plan_name || "subscription"} plan is active until ${new Date(subscription?.current_period_end || "").toLocaleString()}.`
                : subscription?.status === "payment_submitted" ||
                    subscription?.status === "payment_review"
                  ? "Your payment has been submitted and is awaiting verification. The workspace remains restricted until approval."
                  : "Complete your subscription payment to activate your workspace."}
        </p>

        {subscription && (
          <div className="subscription-status-plan">
            <span>Selected plan</span>
            <strong>{subscription.plan_name}</strong>
            <strong>
              {new Intl.NumberFormat("en-TZ", {
                style: "currency",
                currency,
                maximumFractionDigits: currencyScale(currency),
              }).format(amount / 10 ** currencyScale(currency))}
              {subscription.amount > 0 ? ` / ${subscription.billing_interval}` : ""}
            </strong>
            {subscription.status === "payment_rejected" && (
              <span className="error">Payment rejected. Submit new evidence to try again.</span>
            )}
          </div>
        )}

        {["pending", "under_review", "needs_documents"].includes(reviewStatus || "") && (
          <form className="subscription-payment-form" onSubmit={(event) => void submitDocuments(event)}>
            <h2><FileCheck2 size={18} /> Required business documents</h2>
            <p>Upload registration records and any applicable professional or industry licences. Pharmacy businesses should include their current pharmacy licence.</p>
            {portal?.documents?.length ? (
              <p>{portal.documents.length} document(s) currently on file.</p>
            ) : null}
            <label>
              Business documents
              <input
                required={!portal?.documents?.length}
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => setDocuments(Array.from(event.target.files || []))}
              />
            </label>
            <Button type="submit" disabled={busy || !documents.length}>
              {busy ? "Uploading…" : "Submit documents"}
            </Button>
          </form>
        )}

        {reviewStatus === "approved" &&
          needsRenewal &&
          subscription?.status !== "payment_submitted" &&
          subscription?.status !== "payment_review" && (
            <div className="subscription-plan-change">
              <label>
                Choose a plan
                <select value={planId} onChange={(event) => setPlanId(event.target.value)}>
                  <option value="">Select a plan</option>
                  {plans.filter((plan) => plan.amount > 0 || !trialUsed).map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} ·{" "}
                      {new Intl.NumberFormat("en-TZ", {
                        style: "currency",
                        currency: plan.currency,
                        maximumFractionDigits: currencyScale(plan.currency),
                      }).format(plan.amount / 10 ** currencyScale(plan.currency))}
                      {plan.amount ? ` / ${plan.billing_interval}` : " · 31-day trial"}
                    </option>
                  ))}
                </select>
              </label>
              {selectedPlan?.amount === 0 && (
                <p>The free trial begins only after business approval and can be used once.</p>
              )}
              <Button type="button" disabled={busy || !selectedPlan} onClick={() => void choosePlan()}>
                {busy ? "Saving…" : "Select plan"}
              </Button>
            </div>
          )}

        {reviewStatus === "approved" &&
          subscription &&
          subscription.amount > 0 &&
          ["awaiting_payment", "payment_rejected", "expired", "past_due"].includes(
            subscription.status,
          ) && (
            <form className="subscription-payment-form" onSubmit={(event) => void submitPayment(event)}>
              <h2><CreditCard size={18} /> Complete payment</h2>
              {instructions.length ? (
                <div className="subscription-payment-instructions">
                  <strong>Approved payment instructions</strong>
                  {instructions.map(([key, value]) => (
                    <p key={key}><span>{key.replaceAll("_", " ")}</span> {String(value)}</p>
                  ))}
                </div>
              ) : (
                <p className="error">Payment instructions are not configured. Contact support.</p>
              )}
              <label>
                Payment method
                <select value={method} onChange={(event) => setMethod(event.target.value)}>
                  <option value="mobile_money">Mobile money</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="manual">Other manual payment</option>
                </select>
              </label>
              <label>
                Transaction reference
                <input required maxLength={200} value={reference} onChange={(event) => setReference(event.target.value)} />
              </label>
              <label>
                Receipt or payment evidence
                <input
                  required
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(event) => setEvidence(event.target.files?.[0] || null)}
                />
              </label>
              <label>
                Notes
                <textarea required maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
              <Button type="submit" disabled={busy || !instructions.length}>
                {busy ? "Submitting…" : "Submit payment"}
              </Button>
            </form>
          )}

        {portal?.payments?.some((payment) => payment.status === "pending") && (
          <div className="subscription-payment-pending">
            <FileCheck2 size={18} />
            <span>A submitted payment is awaiting review. Do not send it again.</span>
          </div>
        )}

        {portal?.review_events?.some((event) => event.decision === "information_requested") && (
          <div className="subscription-payment-pending">
            <TriangleAlert size={18} />
            <span>
              {portal.review_events.find((event) => event.decision === "information_requested")?.reason}
            </span>
          </div>
        )}
        {loading && <p role="status">Loading your subscription details…</p>}
        {error && <div className="error" role="alert">{error}</div>}
        {message && <div className="success-message" role="status">{message}</div>}
        <div className="subscription-status-actions">
          {(trialActive || paidActive) && (
            <Button asChild>
              <Link to="/app">Open workspace</Link>
            </Button>
          )}
          <Button variant="secondary" onClick={() => void reload()} disabled={loading}>
            Refresh status
          </Button>
          <Button variant="ghost" onClick={onLogout}>Sign out</Button>
        </div>
      </section>
    </main>
  );
}
export function Auth({
  register,
  onUser,
  forcePassword = false,
}: {
  register: boolean;
  onUser: (u: User) => void;
  forcePassword?: boolean;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [timezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [plans, setPlans] = useState<SignupPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState("");
  const [businessCategory, setBusinessCategory] = useState("Retail");
  const selectedPlanId = searchParams.get("plan") || "";
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
  const recoveryLink =
    searchParams.get("reset") === "1" || searchParams.get("type") === "recovery";
  const [mode, setMode] = useState<
    "login" | "register" | "reset" | "new-password"
  >(() =>
    forcePassword || recoveryLink
      ? "new-password"
      : register
        ? "register"
        : "login",
  );

  useEffect(() => {
    if (forcePassword || recoveryLink) {
      setMode("new-password");
      return;
    }
    setMode(register ? "register" : "login");
  }, [register, recoveryLink, forcePassword]);

  const [info, setInfo] = useState("");

  useEffect(() => {
    if (!register) return;
    let active = true;
    setPlansLoading(true);
    void signupPlans()
      .then((availablePlans) => {
        if (active) {
          setPlans(availablePlans);
          setPlansError("");
        }
      })
      .catch((error) => {
        if (active) {
          setPlansError(
            error instanceof Error ? error.message : "Unable to load subscription plans.",
          );
        }
      })
      .finally(() => {
        if (active) setPlansLoading(false);
      });
    return () => {
      active = false;
    };
  }, [register]);

  const renderPlanSelection = () => (
    <div className="signup-plan-picker">
      {plansError && <div className="error" role="alert">{plansError}</div>}
      {plansLoading ? (
        <p role="status">Loading available plans…</p>
      ) : plans.length ? (
        <div className="signup-plan-grid">
          {plans.map((plan) => (
            <section className="signup-plan-card" key={plan.id}>
              <div>
                <h3>{plan.name}</h3>
                <p className="signup-plan-price">
                  {new Intl.NumberFormat("en-TZ", {
                    style: "currency",
                    currency: plan.currency,
                    maximumFractionDigits: currencyScale(plan.currency),
                  }).format(plan.amount / 10 ** currencyScale(plan.currency))}
                  <small> / {plan.billing_interval === "month" ? "month" : "year"}</small>
                </p>
                {plan.trial_days > 0 && (
                  <p className="signup-plan-trial">
                    {plan.trial_days}-day trial after business approval
                  </p>
                )}
                {plan.description && <p>{plan.description}</p>}
              </div>
              {plan.entitlements.length ? (
                <ul>
                  {plan.entitlements.map((entitlement) => (
                    <li key={entitlement.feature_key}>
                      <strong>{entitlement.label}</strong>
                      <span>
                        {!entitlement.enabled
                          ? " · Not included"
                          : entitlement.limit_value !== null
                            ? ` · ${entitlement.limit_value}`
                            : " · Included"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="signup-plan-unconfigured">
                  Plan features and limits are being configured.
                </p>
              )}
              <Button
                type="button"
                onClick={() => {
                  setInfo("");
                  setSearchParams({ plan: plan.id });
                }}
              >
                Select {plan.name}
              </Button>
            </section>
          ))}
        </div>
      ) : !plansError ? (
        <p>No subscription plans are available right now.</p>
      ) : null}
    </div>
  );

  const renderLogin = () => (
    <>
      <Form
        key={String(register)}
        submit={register ? "Create workspace" : "Sign in"}
        onSubmit={async (f) => {
          const body = Object.fromEntries(f);
          if (register) {
            if (!selectedPlan) throw new Error("Choose a subscription plan first.");
            if (body.password !== body.confirm_password) {
              throw new Error("Passwords do not match.");
            }
            body.selected_plan_id = selectedPlan.id;
          }
          if (body.category === "Other") {
            body.custom_category = body.custom_category || body.category_other;
          }
          delete body.category_other;
          const r = await api(
            "/auth/" + (register ? "register" : "login"),
            body,
          );
          if (r.confirmation_required) {
            setInfo(r.message);
            return;
          }
          onUser(r.user);
          const account = r.user as User;
          const periodEnd = account.subscription_period_end
            ? new Date(account.subscription_period_end).getTime()
            : 0;
          const hasSubscriptionAccess =
            !account.subscription_enforced ||
            (account.business_review_status === "approved" &&
              (account.subscription_status === "active"
                ? periodEnd > Date.now()
                : account.subscription_status === "trialing" &&
                  Boolean(
                    account.trial_end &&
                      new Date(account.trial_end).getTime() > Date.now(),
                  )));
          navigate(
            account.is_admin
              ? "/admin"
              : hasSubscriptionAccess
                ? "/app"
                : "/account-status",
          );
        }}
      >
        {register && selectedPlan && (
          <div className="signup-selected-plan">
            <span>Selected plan</span>
            <strong>{selectedPlan.name}</strong>
            <span>
              {new Intl.NumberFormat("en-TZ", {
                style: "currency",
                currency: selectedPlan.currency,
                maximumFractionDigits: currencyScale(selectedPlan.currency),
              }).format(selectedPlan.amount / 10 ** currencyScale(selectedPlan.currency))}
              {" / "}
              {selectedPlan.billing_interval}
            </span>
            <button type="button" className="text-link" onClick={() => setSearchParams({})}>
              Change plan
            </button>
            <input type="hidden" name="selected_plan_id" value={selectedPlan.id} />
          </div>
        )}
        <Fields
          onValuesChange={(name, value) => {
            if (name === "category") setBusinessCategory(value);
          }}
          fields={[
            ...(register
              ? [
                  { name: "name", label: "Your full name" },
                  { name: "business", label: "Legal business name" },
                  {
                    name: "category",
                    label: "Business type",
                    value: "Retail",
                    options: businessCategories.map((value) => ({
                      value,
                      label: value,
                    })),
                    otherOption: true,
                    otherFieldName: "custom_category",
                  },
                ]
              : []),
            { name: "email", label: "Email address", type: "email" },
            ...(register
              ? [{ name: "phone", label: "Phone number", type: "tel" }]
              : []),
            {
              name: "password",
              label: "Password",
              type: "password",
              help: register ? "At least 10 characters." : undefined,
            },
            ...(register
              ? [
                  {
                    name: "confirm_password",
                    label: "Confirm password",
                    type: "password",
                  },
                  {
                    name: "branch",
                    label: "First branch",
                    value: "Main branch",
                  },
                  {
                    name: "country",
                    label: "Country",
                    value: "Kenya",
                    options: countryOptions,
                  },
                  {
                    name: "currency",
                    label: "Business currency",
                    value: DEFAULT_CURRENCY,
                    options: currencyOptions,
                  },
                  {
                    name: "timezone",
                    label: "Business timezone",
                    value: timezone,
                  },
                  { name: "region", label: "Region" },
                  {
                    name: "address",
                    label: "Business address",
                    type: "textarea",
                  },
                  {
                    name: "registration_number",
                    label:
                      businessCategory === "Pharmacy"
                        ? "Business registration / pharmacy licence number"
                        : "Business registration number",
                  },
                ]
              : []),
          ]}
        />
      </Form>
      {!register && (
        <p className="auth-switch">
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setInfo("");
              setMode("reset");
            }}
          >
            Forgot password?
          </button>
        </p>
      )}
    </>
  );

  const renderReset = () => (
    <>
      <Form
        submit="Send reset link"
        onSubmit={async (f) => {
          const body = Object.fromEntries(f);
          await api("/auth/reset-request", body);
          setInfo("Check your email for a secure reset link.");
          setMode("login");
        }}
      >
        <Fields
          fields={[{ name: "email", label: "Email address", type: "email" }]}
        />
      </Form>
      <p className="auth-switch">
        <button
          type="button"
          className="text-link"
          onClick={() => {
            setInfo("");
            setMode("login");
          }}
        >
          Back to sign in <ArrowUpRight size={14} />
        </button>
      </p>
    </>
  );

  const renderRecovery = () => (
    <>
      <Form
        submit="Update password"
        onSubmit={async (f) => {
          const body = Object.fromEntries(f);
          if (body.password !== body.confirm) {
            throw new Error("Passwords do not match.");
          }
          if (String(body.password || "").length < 10) {
            throw new Error("Choose a password with at least 10 characters.");
          }
          await api(
            forcePassword
              ? "/auth/complete-password-change"
              : "/auth/reset-password",
            body,
          );
          const me = await api("/auth/me");
          onUser(me.user);
          navigate("/app");
        }}
      >
        <Fields
          fields={[
            {
              name: "password",
              label: "New password",
              type: "password",
              help: "Use at least 10 characters.",
            },
            { name: "confirm", label: "Confirm new password", type: "password" },
          ]}
        />
      </Form>
      {!forcePassword && (
        <p className="auth-switch">
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setInfo("");
              setMode("login");
            }}
          >
            Return to sign in <ArrowUpRight size={14} />
          </button>
        </p>
      )}
    </>
  );

  const activeContent =
    forcePassword
      ? renderRecovery()
      : mode === "register"
      ? selectedPlan
        ? renderLogin()
        : renderPlanSelection()
      : mode === "reset"
        ? renderReset()
        : mode === "new-password"
          ? renderRecovery()
          : renderLogin();

  return (
    <div className="auth-page">
      <div className="auth-story">
        <Link to="/">
          <Logo />
        </Link>
        <div>
          <span className="eyebrow">YOUR BUSINESS, IN SYNC</span>
          <h1>
            Less juggling.
            <br />
            More growing.
          </h1>
          <p>
            One workspace for the people, products and possibilities behind your
            business.
          </p>
          <div className="auth-points">
            {[
              "Every product accounted for",
              "Every sale connected",
              "Every day a little clearer",
            ].map((s) => (
              <div key={s}>
                <Check size={18} />
                {s}
              </div>
            ))}
          </div>
        </div>
        <small>Built for the everyday business.</small>
      </div>
      <div className="auth-content">
        <Link to="/" className="back-link">
          ← Back to Smartsell
        </Link>
        <div
          className={
            mode === "register" && !selectedPlan
              ? "auth-form signup-plan-form"
              : "auth-form"
          }
        >
          <span className="eyebrow">
            {mode === "register"
              ? selectedPlan
                ? "A FRESH START"
                : "SUBSCRIPTION"
              : mode === "reset"
                ? "PASSWORD HELP"
                : mode === "new-password"
                      ? forcePassword
                        ? "FIRST SIGN-IN"
                        : "SECURE YOUR ACCOUNT"
                  : "GOOD TO SEE YOU"}
          </span>
          <h2>
            {mode === "register"
              ? selectedPlan
                ? "Let’s set up your business."
                : "Choose your plan."
              : mode === "reset"
                ? "Reset your password."
                : mode === "new-password"
                  ? forcePassword
                    ? "Set your new password."
                    : "Choose a new password."
                  : "Welcome back."}
          </h2>
          <p>
            {mode === "register"
              ? selectedPlan
                ? "Your business will be reviewed before workspace access is enabled."
                : "Select a subscription plan before creating your account."
              : mode === "reset"
                ? "Enter the email address for your Smartsell account."
                : mode === "new-password"
                    ? forcePassword
                      ? "For your security, choose a new password before opening your workspace."
                      : "Create a fresh password to continue signing in."
                  : "Sign in to pick up where you left off."}
          </p>
          {activeContent}
          {info && <p className="success-message">{info}</p>}
          {!register && mode === "login" && (
            <p className="auth-switch">
              New to Smartsell?{" "}
              <Link to="/register">
                Create a workspace <ArrowUpRight size={14} />
              </Link>
            </p>
          )}
          {register && mode === "register" && (
            <p className="auth-switch">
              Already have an account?{" "}
              <Link to="/login">
                Sign in <ArrowUpRight size={14} />
              </Link>
            </p>
          )}
        </div>
        <small className="local-note">
          <ShieldCheck size={14} /> Your connected business workspace · no
          demo records
        </small>
      </div>
    </div>
  );
}

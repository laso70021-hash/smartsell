import { useEffect, useState } from "react";
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
} from "lucide-react";
import { Logo, Fields, Form } from "./shared";
import { Button } from "./ui/button";
import {
  api,
  businessCategories,
  currencyOptions,
  countryOptions,
  DEFAULT_CURRENCY,
  type User,
} from "../lib/api";
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
export function Auth({
  register,
  onUser,
}: {
  register: boolean;
  onUser: (u: User) => void;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [timezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const recoveryLink =
    searchParams.get("reset") === "1" || searchParams.get("type") === "recovery";
  const [mode, setMode] = useState<
    "login" | "register" | "reset" | "new-password"
  >(() => (recoveryLink ? "new-password" : register ? "register" : "login"));

  useEffect(() => {
    if (recoveryLink) {
      setMode("new-password");
      return;
    }
    setMode(register ? "register" : "login");
  }, [register, recoveryLink]);

  const [info, setInfo] = useState("");

  const renderLogin = () => (
    <>
      <Form
        key={String(register)}
        submit={register ? "Create workspace" : "Sign in"}
        onSubmit={async (f) => {
          const body = Object.fromEntries(f);
          if (body.category === "Other") {
            body.custom_category = body.custom_category || body.category_other;
          }
          delete body.category_other;
          const r = await api(
            "/auth/" + (register ? "register" : "login"),
            body,
          );
          onUser(r.user);
          navigate("/app");
        }}
      >
        <Fields
          fields={[
            ...(register
              ? [
                  { name: "name", label: "Your full name" },
                  { name: "business", label: "Business name" },
                  {
                    name: "category",
                    label: "Business category",
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
            {
              name: "password",
              label: "Password",
              type: "password",
              help: register ? "At least 10 characters." : undefined,
            },
            ...(register
              ? [
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
          await api("/auth/reset-password", body);
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
              help: "Use at least 8 characters.",
            },
            { name: "confirm", label: "Confirm new password", type: "password" },
          ]}
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
          Return to sign in <ArrowUpRight size={14} />
        </button>
      </p>
    </>
  );

  const activeContent =
    mode === "register"
      ? renderLogin()
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
        <div className="auth-form">
          <span className="eyebrow">
            {mode === "register"
              ? "A FRESH START"
              : mode === "reset"
                ? "PASSWORD HELP"
                : mode === "new-password"
                  ? "SECURE YOUR ACCOUNT"
                  : "GOOD TO SEE YOU"}
          </span>
          <h2>
            {mode === "register"
              ? "Let’s set up your business."
              : mode === "reset"
                ? "Reset your password."
                : mode === "new-password"
                  ? "Choose a new password."
                  : "Welcome back."}
          </h2>
          <p>
            {mode === "register"
              ? "A few details, and you’re ready to make it yours."
              : mode === "reset"
                ? "Enter the email address for your Smartsell account."
                : mode === "new-password"
                  ? "Create a fresh password to continue signing in."
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

import { getSupabase, supabaseError } from "./supabase";

export type Row = { id: string; [key: string]: any };
const PRODUCT_IMAGE_BUCKET = "smartsell-product-images";
const PRODUCT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024;
export const MAX_PRODUCT_IMPORT_IMAGE_BYTES = 50 * 1024 * 1024;
export const businessCategories = [
  "Retail",
  "Grocery",
  "Fashion",
  "Electronics",
  "Restaurant",
  "Pharmacy",
  "Beauty & Personal Care",
  "Hardware",
  "Other",
];
export const DEFAULT_CURRENCY = "TZS";
const countryCodes =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW";
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
export const countryOptions = countryCodes
  .split(" ")
  .map((code) => ({
    value: code === "XK" ? "Kosovo" : countryNames.of(code) || code,
    label: code === "XK" ? "Kosovo" : countryNames.of(code) || code,
  }))
  .sort((left, right) => left.label.localeCompare(right.label));
const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });
export const currencyOptions = Intl.supportedValuesOf("currency")
  .map((code) => ({
    value: code,
    label: currencyNames.of(code) || code,
  }))
  .sort((left, right) =>
    left.value === DEFAULT_CURRENCY
      ? -1
      : right.value === DEFAULT_CURRENCY
        ? 1
        : left.label.localeCompare(right.label),
  );
export type User = {
  id: string;
  name: string;
  email: string;
  business_id: string;
  branch_id: string;
  role: "owner" | "manager" | "cashier";
  theme: "dark" | "light";
  account_status?: "active" | "pending" | "suspended";
  member_status?: "active" | "pending" | "suspended";
  access_expired?: boolean;
  suspension_reason?: string;
  must_change_password?: boolean;
  expires_at?: string | null;
  is_admin?: boolean;
};
export type Workspace = {
  user: User;
  business: Row;
  branches: Row[];
  products: Row[];
  sales: Row[];
  items: Row[];
  parties: Row[];
  purchases: Row[];
  expenses: Row[];
  events: Row[];
  movements: Row[];
  staff: Row[];
  exports: Row[];
};
export type PlatformAdminRange = "today" | "7d" | "30d" | "month";
export type PlatformAdminOverview = {
  stats: {
    businesses: number;
    users: number;
    active: number;
    suspended: number;
    branches: number;
    products: number;
    low_stock: number;
    sales_by_currency: Array<{
      currency: string;
      total: number;
      transactions: number;
    }>;
    stock_value_by_currency: Array<{ currency: string; value: number }>;
  };
  businesses: Array<
    Row & {
      name: string;
      category: string;
      country: string;
      currency: string;
      member_count: number;
      branch_count: number;
      owner_name: string | null;
    }
  >;
  users: Array<
    User & {
      business_name: string;
      branch_name: string;
      active: number;
      is_platform_admin: boolean;
      created_at: string;
    }
  >;
  branches: Array<
    Row & {
      business_name: string;
      category: string;
      staff_count: number;
      active: number;
    }
  >;
  business_types: Array<{ type: string; count: number }>;
  growth: Array<{ date: string; count: number }>;
  recent: Row[];
  recent_sales: Row[];
  range: PlatformAdminRange;
  subscription_revenue_available: boolean;
};
export type PlatformAdminOperations = {
  range: PlatformAdminRange;
  total?: number;
  limited?: boolean;
  inventory?: Array<
    Row & {
      business_name: string;
      currency: string;
      name: string;
      sku: string;
      category: string;
      unit: string;
      cost: number;
      price: number;
      threshold: number;
      total_quantity: number;
      low_stock_locations: number;
      branch_stock: Array<{
        branch_id: string;
        branch_name: string;
        quantity: number;
        low_stock: boolean;
      }>;
    }
  >;
  sales?: Row[];
  transactions?: Row[];
  audit_logs?: Row[];
  sales_by_currency?: Array<{
    currency: string;
    total: number;
    transactions: number;
  }>;
  purchases_by_currency?: Array<{
    currency: string;
    total: number;
    transactions: number;
  }>;
  expenses_by_currency?: Array<{
    currency: string;
    total: number;
    transactions: number;
  }>;
  totals_by_type?: Array<{ type: string; count: number }>;
  daily_activity?: Array<{
    date: string;
    sales: number;
    purchases: number;
    expenses: number;
  }>;
  business_types?: Array<{ type: string; count: number }>;
};
export type PlatformBilling = {
  plans: Array<
    Row & {
      name: string;
      description: string;
      amount: number;
      currency: string;
      billing_interval: "month" | "year";
      trial_days: number;
      active: boolean;
      current_subscribers: number;
      created_at: string;
    }
  >;
  subscriptions: Array<
    Row & {
      business_id: string;
      business_name: string;
      business_currency: string;
      plan_id: string;
      plan_name: string;
      status: "trialing" | "active" | "past_due" | "canceled" | "expired";
      billing_interval: "month" | "year";
      amount: number;
      currency: string;
      current_period_start: string;
      current_period_end: string;
      trial_end: string | null;
      created_at: string;
    }
  >;
  payments: Array<
    Row & {
      subscription_id: string;
      business_id: string;
      business_name: string;
      amount: number;
      currency: string;
      status: "pending" | "paid" | "failed" | "refunded";
      method: string;
      external_reference: string | null;
      note: string;
      recorded_by: string | null;
      created_at: string;
    }
  >;
  businesses: Array<{ id: string; name: string; currency: string }>;
  summary: {
    plans: number;
    subscribers: number;
    trialing: number;
    past_due: number;
    paid_by_currency: Array<{
      currency: string;
      total: number;
      payments: number;
    }>;
  };
  range: PlatformAdminRange;
  payment_provider_configured: boolean;
};
export type PlatformReviewStatus =
  | "pending"
  | "under_review"
  | "needs_documents"
  | "approved"
  | "rejected"
  | "suspended"
  | "unreviewed";
export type PlatformApplication = {
  business_id: string;
  business_name: string;
  category: string;
  custom_category: string;
  country: string;
  address: string;
  tax_id: string;
  email: string;
  phone: string;
  created_at: string;
  status: PlatformReviewStatus;
  reason: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  owner_name: string | null;
  owner_email: string | null;
  active_branches: number;
};
export type PlatformSupportMessage = {
  id: string;
  actor_id: string;
  actor_name: string;
  body: string;
  created_at: string;
};
export type PlatformSupportTicket = {
  id: string;
  business_id: string | null;
  business_name: string;
  subject: string;
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  status:
    | "open"
    | "in_progress"
    | "waiting_on_business"
    | "resolved"
    | "closed";
  assigned_admin?: string | null;
  created_by?: string;
  resolution_note: string;
  created_at: string;
  updated_at: string;
  messages: PlatformSupportMessage[];
};
export type PlatformRestaurantOverview = {
  restaurants: Array<{
    id: string;
    name: string;
    country: string;
    currency: string;
    branches: number;
    dining_tables: number;
    kitchen_stations: number;
    open_orders: number;
  }>;
  orders: Array<{
    id: string;
    reference: string;
    status: string;
    notes: string;
    created_at: string;
    updated_at: string;
    business_id: string;
    business_name: string;
    currency: string;
    branch_name: string;
    table_name: string | null;
    item_count: number;
  }>;
  orders_by_status: Array<{ status: string; count: number }>;
  sales_by_currency: Array<{
    currency: string;
    total: number;
    count: number;
  }>;
  range: PlatformAdminRange;
};
export type PlatformSettings = {
  site_name: string;
  support_email: string;
  support_phone: string;
  website_url: string;
  contact_address: string;
  supported_countries: string[];
  supported_currencies: string[];
  business_types: string[];
};
export type PlatformBusinessAccount = {
  id: string;
  name: string;
  category: string;
  custom_category: string;
  country: string;
  currency: string;
  created_at: string;
  account_status: "active" | "suspended";
  suspension_reason: string;
  suspended_at: string | null;
  suspended_by: string | null;
  owner_name: string | null;
  member_count: number;
  active_member_count: number;
  branch_count: number;
};
type AuthMetadata = {
  name?: string;
  business?: string;
  currency?: string;
  country?: string;
  timezone?: string;
  branch?: string;
  category?: string;
  custom_category?: string;
};
async function rpc<T>(name: string, args: Record<string, unknown> = {}) {
  const client = getSupabase();
  const result = await client.rpc(name, args);
  if (
    !result.error ||
    result.error.code !== "42501" ||
    !result.error.message.includes("permission denied for function")
  ) {
    if (result.error) throw supabaseError(result.error);
    return result.data as T;
  }

  const { data: refreshed, error: refreshError } =
    await client.auth.refreshSession();
  if (refreshError) {
    const { data: sessionData, error: sessionError } =
      await client.auth.getSession();
    if (sessionError) throw supabaseError(sessionError);
    if (!sessionData.session) {
      const { error: signOutError } = await client.auth.signOut({
        scope: "local",
      });
      if (signOutError) throw supabaseError(signOutError);
      throw new Error("Your sign-in session has expired. Sign in again.");
    }
    throw supabaseError(refreshError);
  }
  if (!refreshed.session) {
    const { error: signOutError } = await client.auth.signOut({
      scope: "local",
    });
    if (signOutError) throw supabaseError(signOutError);
    throw new Error("Your sign-in session has expired. Sign in again.");
  }

  const retry = await client.rpc(name, args);
  if (retry.error) {
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) {
      const { error: signOutError } = await client.auth.signOut({
        scope: "local",
      });
      if (signOutError) throw supabaseError(signOutError);
      throw new Error("Your sign-in session has expired. Sign in again.");
    }
    throw supabaseError(retry.error);
  }
  return retry.data as T;
}
export function platformAdminRequest<T>(
  action: string,
  options: { range?: PlatformAdminRange; body?: Record<string, unknown> } = {},
) {
  return rpc<T>("smartsell_platform_admin", {
    command: {
      action,
      ...(options.range ? { range: options.range } : {}),
      ...(options.body || {}),
    },
  });
}
export function platformAdminOperations<T>(
  action: string,
  options: {
    range?: PlatformAdminRange;
    body?: Record<string, unknown>;
  } = {},
) {
  return rpc<T>("smartsell_platform_admin_operations", {
    command: {
      action,
      ...(options.range ? { range: options.range } : {}),
      ...(options.body || {}),
    },
  });
}
export function platformBillingRequest<T>(
  action: string,
  options: {
    range?: PlatformAdminRange;
    body?: Record<string, unknown>;
  } = {},
) {
  return rpc<T>("smartsell_platform_billing", {
    command: {
      action,
      ...(options.range ? { range: options.range } : {}),
      ...(options.body || {}),
    },
  });
}
export function platformConsoleRequest<T>(
  action: string,
  body: Record<string, unknown> = {},
) {
  return rpc<T>("smartsell_platform_console", {
    command: { action, ...body },
  });
}
export function platformBusinessRequest<T>(
  action: string,
  body: Record<string, unknown> = {},
) {
  return rpc<T>("smartsell_platform_business", {
    command: { action, ...body },
  });
}
export function validateProductImage(file: File) {
  if (!PRODUCT_IMAGE_TYPES.has(file.type))
    throw new Error("Choose a JPEG, PNG, or WebP product photo.");
  if (file.size > MAX_PRODUCT_IMAGE_SIZE)
    throw new Error("Product photos must be 5 MB or smaller.");
}
export function productImageUrl(path?: string | null) {
  if (!path) return "";
  return getSupabase().storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path)
    .data.publicUrl;
}
export async function uploadProductImage(
  businessId: string,
  productId: string,
  file: File,
) {
  validateProductImage(file);
  const path = `${businessId}/${productId}/${crypto.randomUUID()}`;
  const { error } = await getSupabase()
    .storage.from(PRODUCT_IMAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "0",
      contentType: file.type,
      upsert: false,
    });
  if (error) throw supabaseError(error);
  return path;
}
export async function saveProductImagePaths(
  images: { product_id: string; path: string | null }[],
) {
  if (!images.length) return;
  await rpc("smartsell_product_images", {
    command: { action: "save", images },
  });
}
export async function removeProductImageObject(path: string) {
  const { error } = await getSupabase()
    .storage.from(PRODUCT_IMAGE_BUCKET)
    .remove([path]);
  if (error) throw supabaseError(error);
}
async function identity() {
  const client = getSupabase();
  const isAuthCallback = (() => {
    if (typeof window === "undefined") return false;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const search = new URLSearchParams(window.location.search);
    return (
      hash.has("access_token") ||
      hash.has("error") ||
      hash.has("error_description") ||
      search.has("code")
    );
  })();
  const clearAuthCallback = () => {
    if (!isAuthCallback || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.hash = "";
    for (const key of ["code", "error", "error_code", "error_description"]) {
      url.searchParams.delete(key);
    }
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}`,
    );
  };
  const { error: initializationError } = await client.auth.initialize();
  if (initializationError) {
    clearAuthCallback();
    if (isAuthCallback) {
      throw new Error(
        "This confirmation link is invalid or has expired. Request a new confirmation email and open the latest link.",
      );
    }
    throw supabaseError(initializationError);
  }
  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError) throw supabaseError(sessionError);
  if (!sessionData.session) {
    clearAuthCallback();
    if (isAuthCallback) {
      throw new Error(
        "We couldn't restore your sign-in from that confirmation link. It may have expired or already been used. Request a new confirmation email and open the latest link.",
      );
    }
    throw new Error("Sign in to continue.");
  }
  const { data, error } = await client.auth.getUser(
    sessionData.session.access_token,
  );
  if (error) throw supabaseError(error);
  if (!data.user) throw new Error("Sign in to continue.");
  let member = await rpc<User | null>("smartsell_identity");
  if (!member) {
    const metadata = data.user.user_metadata as AuthMetadata;
    if (!metadata.business || !metadata.branch || !metadata.name)
      throw new Error(
        "Your account has no Smartsell business yet. Complete business setup or contact your business owner.",
      );
    member = await rpc<User>("smartsell_onboard", {
      v: {
        name: metadata.name,
        business: metadata.business,
        currency: metadata.currency || "TZS",
        country: metadata.country || "Kenya",
        timezone:
          metadata.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        branch: metadata.branch,
        category: metadata.category || "Retail",
        custom_category: metadata.custom_category || "",
      },
    });
  }
  return { user: member };
}
export function resolveAppOrigin() {
  const candidates = [
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "",
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env.VITE_APP_URL ||
        import.meta.env.VITE_PUBLIC_APP_URL ||
        import.meta.env.VITE_SITE_URL ||
        import.meta.env.VITE_ORIGIN ||
        import.meta.env.SUPABASE_AUTH_REDIRECT_URL
      : "",
    typeof process !== "undefined" && process.env
      ? process.env.APP_ORIGIN ||
        process.env.PUBLIC_APP_URL ||
        process.env.SITE_URL ||
        process.env.VITE_APP_URL ||
        process.env.VITE_PUBLIC_APP_URL ||
        process.env.SUPABASE_AUTH_REDIRECT_URL
      : "",
    "https://smartsell.swahivo.com",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const value = String(candidate).trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.origin;
      }
    } catch {
      const normalized = value.replace(/\/+$/, "");
      if (normalized) return normalized;
    }
  }

  return "https://smartsell.swahivo.com";
}

function authRedirectUrl(path: string) {
  const baseOrigin = resolveAppOrigin();
  return new URL(path, `${baseOrigin.replace(/\/+$/, "")}/`).toString();
}

async function signUp(body: Record<string, any>) {
  const { data, error } = await getSupabase().auth.signUp({
    email: String(body.email || ""),
    password: String(body.password || ""),
    options: {
      data: {
        name: body.name,
        business: body.business,
        currency: body.currency,
        country: body.country,
        timezone: body.timezone,
        branch: body.branch,
        category: body.category || "Retail",
        custom_category: body.custom_category || "",
      } satisfies AuthMetadata,
      emailRedirectTo: authRedirectUrl("/login"),
    },
  });
  if (error) throw supabaseError(error);
  if (!data.session)
    throw new Error(
      "Check your email to confirm your account, then open the latest confirmation link to finish setting up your business.",
    );
  return identity();
}
async function signIn(body: Record<string, any>) {
  const { error } = await getSupabase().auth.signInWithPassword({
    email: String(body.email || ""),
    password: String(body.password || ""),
  });
  if (error) throw supabaseError(error);
  return identity();
}
async function requestPasswordReset(body: Record<string, any>) {
  const email = String(body.email || "").trim();
  if (!email) throw new Error("Enter your email address.");
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectUrl("/login?reset=1"),
  });
  if (error) throw supabaseError(error);
  return { ok: true, email };
}

async function updatePassword(body: Record<string, any>) {
  const client = getSupabase();
  const { data, error } = await client.auth.getUser();
  if (error) throw supabaseError(error);
  if (!data.user?.email) throw new Error("Sign in to change your password.");
  const verification = await client.auth.signInWithPassword({
    email: data.user.email,
    password: String(body.current || ""),
  });
  if (verification.error) throw supabaseError(verification.error);
  const updated = await client.auth.updateUser({
    password: String(body.password || ""),
  });
  if (updated.error) throw supabaseError(updated.error);
  return { ok: true };
}

async function updatePasswordFromRecovery(body: Record<string, any>) {
  const password = String(body.password || "");
  if (password.length < 8) {
    throw new Error("Choose a password with at least 8 characters.");
  }
  const { error } = await getSupabase().auth.updateUser({ password });
  if (error) throw supabaseError(error);
  return { ok: true };
}

async function completePasswordSetup(body: Record<string, unknown>) {
  const password = String(body.password || "");
  if (password.length < 10) {
    throw new Error("Choose a password with at least 10 characters.");
  }
  const { data, error } = await getSupabase().functions.invoke<{
    ok: boolean;
  }>("invite-team-member", {
    body: { action: "complete-password-change", password },
  });
  if (error) {
    if (error.context instanceof Response) {
      const result = (await error.context.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(result?.error || error.message);
    }
    throw error;
  }
  return data;
}

async function invokeTeamFunction(body: Record<string, unknown>) {
  const { data, error } = await getSupabase().functions.invoke<{
    ok: boolean;
    email?: string;
    message?: string;
  }>("invite-team-member", { body });
  if (error) {
    if (error.context instanceof Response) {
      const result = (await error.context.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(result?.error || error.message);
    }
    throw error;
  }
  return data;
}

export async function api<T = any>(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
  operation?: { id: string; entityId: string; createdAt: string },
): Promise<T> {
  const client = getSupabase();
  if (path === "/auth/me") return (await identity()) as T;
  if (path === "/auth/register" && method === "POST")
    return (await signUp((body || {}) as Record<string, any>)) as T;
  if (path === "/auth/login" && method === "POST")
    return (await signIn((body || {}) as Record<string, any>)) as T;
  if (path === "/auth/reset-request" && method === "POST")
    return (await requestPasswordReset((body || {}) as Record<string, any>)) as T;
  if (path === "/auth/reset-password" && method === "POST")
    return (await updatePasswordFromRecovery((body || {}) as Record<string, any>)) as T;
  if (path === "/auth/complete-password-change" && method === "POST")
    return (await completePasswordSetup(
      (body || {}) as Record<string, unknown>,
    )) as T;
  if (path === "/auth/logout" && method === "POST") {
    const { error } = await client.auth.signOut();
    if (error) throw supabaseError(error);
    return { ok: true } as T;
  }
  if (path === "/password" && method === "POST")
    return (await updatePassword((body || {}) as Record<string, any>)) as T;
  if (path.startsWith("/workspace")) {
    const branch = new URLSearchParams(path.split("?")[1] || "").get("branch");
    const workspace = await rpc<Workspace>("smartsell_workspace", {
      b: branch || null,
    });
    const { images } = await rpc<{
      images: { product_id: string; path: string }[];
    }>("smartsell_product_images", { command: { action: "list" } });
    const paths = new Map(images.map((image) => [image.product_id, image.path]));
    return {
      ...workspace,
      products: workspace.products.map((product) => {
        const imagePath = paths.get(product.id) || null;
        return {
          ...product,
          image_path: imagePath,
          image_url: productImageUrl(imagePath),
        };
      }),
    } as T;
  }
  if (path === "/business" && method === "PUT")
    return (await rpc<T>("smartsell_update_business", {
      command: body,
    })) as T;
  if (path.startsWith("/restaurant")) {
    const [pathname, query] = path.split("?", 2);
    if (method === "GET" && pathname === "/restaurant") {
      const branch = new URLSearchParams(query || "").get("branch");
      return (await rpc<T>("smartsell_restaurant", {
        command: { action: "list", branch_id: branch || undefined },
      })) as T;
    }

    const commandBody = (body || {}) as Record<string, any>;
    const orderMatch = pathname.match(
      /^\/restaurant\/orders\/([0-9a-f-]{36})(?:\/(submit|close|cancel)|\/items\/([0-9a-f-]{36})\/status)$/i,
    );
    let action: string;
    let entityId: string | undefined;
    let itemId: string | undefined;
    if (method === "POST" && pathname === "/restaurant/tables") {
      action = "create_table";
    } else if (method === "POST" && pathname === "/restaurant/stations") {
      action = "create_station";
    } else if (method === "POST" && pathname === "/restaurant/orders") {
      action = "create_order";
    } else if (method === "POST" && orderMatch) {
      entityId = orderMatch[1];
      itemId = orderMatch[3];
      action = itemId
        ? "set_item_status"
        : `${orderMatch[2]}_order`;
    } else {
      throw new Error("Unsupported restaurant operation.");
    }

    return (await rpc<T>("smartsell_restaurant", {
      command: {
        action,
        id: operation?.id || crypto.randomUUID(),
        entity_id: operation?.entityId || entityId || crypto.randomUUID(),
        created_at: operation?.createdAt || new Date().toISOString(),
        ...(itemId ? { item_id: itemId } : {}),
        ...(action === "set_item_status"
          ? { status: commandBody.status }
          : {}),
        body: commandBody,
      },
    })) as T;
  }
  if (path.startsWith("/cashier-shifts")) {
    const [pathname, query] = path.split("?", 2);
    if (pathname !== "/cashier-shifts")
      throw new Error("Unsupported cashier shift operation.");
    const params = new URLSearchParams(query || "");
    const command = method === "GET"
      ? {
          action: params.get("scope") === "active" ? "active" : "list",
          branch_id: params.get("branch") || undefined,
          from: params.get("from") || undefined,
          to: params.get("to") || undefined,
          cashier_id: params.get("cashier") || undefined,
        }
      : body;
    return (await rpc<T>("smartsell_cashier_shifts", { command })) as T;
  }
  if (path.startsWith("/document-templates") && method === "GET") {
    const documentType = new URLSearchParams(path.split("?")[1] || "").get(
      "document_type",
    );
    return (await rpc<T>("smartsell_document_templates", {
      command: {
        action: "list",
        document_type: documentType || "sales_receipt",
      },
    })) as T;
  }
  if (path === "/document-templates" && method === "POST")
    return (await rpc<T>("smartsell_document_templates", {
      command: body,
    })) as T;
  if (path === "/team-invitations" && method === "POST") {
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("Provide the team member invitation details.");
    return (await invokeTeamFunction(body as Record<string, unknown>)) as T;
  }
  if (path.startsWith("/staff/")) {
    const [pathname] = path.split("?", 1);
    const match = pathname.match(
      /^\/staff\/([0-9a-f-]{36})(?:\/(toggle))?$/i,
    );
    if (!match) throw new Error("Unsupported team member operation.");
    const action =
      method === "PUT"
        ? "edit"
        : method === "DELETE"
          ? "delete"
          : method === "POST" && match[2] === "toggle"
            ? "toggle"
            : "";
    if (!action) throw new Error("Unsupported team member operation.");
    return (await rpc<T>("smartsell_team_manage", {
      command: {
        action,
        member_id: match[1],
        ...(body && typeof body === "object"
          ? (body as Record<string, unknown>)
          : {}),
      },
    })) as T;
  }
  const [pathname, query] = path.split("?", 2);
  const defaultTemplate = pathname.match(
    /^\/document-templates\/([0-9a-f-]{36})\/default$/i,
  );
  if (defaultTemplate && method === "PUT")
    return (await rpc<T>("smartsell_document_templates", {
      command: {
        action: "set_default",
        id: defaultTemplate[1],
        document_type:
          new URLSearchParams(query || "").get("document_type") ||
          "sales_receipt",
      },
    })) as T;
  const parsed = new URL(path, window.location.origin);
  const commandBody = (body || {}) as Record<string, any>;
  const operationId =
    operation?.id ||
    (path === "/sales" && commandBody.idempotency
      ? commandBody.idempotency
      : crypto.randomUUID());
  const entityMatch = path.match(/^\/(?:products|branches|staff)\/([0-9a-f-]{36})/i);
  const result = await rpc<T>("smartsell_command", {
    command: {
      id: operationId,
      entity_id: operation?.entityId || entityMatch?.[1] || crypto.randomUUID(),
      path: parsed.pathname,
      method,
      body: commandBody,
      created_at: operation?.createdAt || new Date().toISOString(),
    },
  });
  return result;
}
export function dateKey(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function toMinor(value: FormDataEntryValue | null, scale = 2) {
  const s = String(value || "0").trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Enter a positive amount.");
  const [whole, decimal = ""] = s.split(".");
  if (decimal.length > scale)
    throw new Error(`Use at most ${scale} decimal places.`);
  const n = Number(
    BigInt(whole) * 10n ** BigInt(scale) +
      BigInt(decimal.padEnd(scale, "0") || "0"),
  );
  if (!Number.isSafeInteger(n)) throw new Error("Amount is too large.");
  return n;
}
export function currencyScale(currency: string) {
  return (
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}
export function multiplyMinor(unitPrice: number, quantity: number) {
  const milli = Math.round(quantity * 1000);
  return Number((BigInt(unitPrice) * BigInt(milli) + 500n) / 1000n);
}

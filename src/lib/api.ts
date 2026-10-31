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
export type User = {
  id: string;
  name: string;
  email: string;
  business_id: string;
  branch_id: string;
  role: "owner" | "manager" | "cashier";
  theme: "dark" | "light";
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
  const { data, error } = await getSupabase().rpc(name, args);
  if (error) throw supabaseError(error);
  return data as T;
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
  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError) throw supabaseError(sessionError);
  if (!sessionData.session) throw new Error("Sign in to continue.");
  const { data, error } = await client.auth.getUser();
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
        currency: metadata.currency || "KES",
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
      emailRedirectTo: new URL("/login", window.location.origin).toString(),
    },
  });
  if (error) throw supabaseError(error);
  if (!data.session)
    throw new Error(
      "Check your email to confirm your Supabase account, then sign in to finish business setup.",
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
    const { data, error } = await client.functions.invoke<{
      ok: boolean;
      email: string;
      message: string;
    }>("invite-team-member", { body: body as Record<string, unknown> });
    if (error) {
      if (error.context instanceof Response) {
        const result = (await error.context.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(result?.error || error.message);
      }
      throw error;
    }
    return data as T;
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

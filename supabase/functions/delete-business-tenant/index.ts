import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const configuredOrigins = [
  Deno.env.get("ALLOWED_ORIGINS"),
  Deno.env.get("APP_ORIGIN"),
  Deno.env.get("PUBLIC_APP_URL"),
  Deno.env.get("SITE_URL"),
].flatMap((value) =>
  (value || "")
    .split(",")
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter(Boolean),
);
const allowedOrigins = new Set([
  ...configuredOrigins,
  "https://smartsell.swahivo.com",
  "https://smartsell.wahivo.com",
  "http://localhost:5173",
]);

function isAllowedOrigin(origin: string | null) {
  if (!origin) return false;
  if (allowedOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    return (
      url.protocol === "https:" &&
      /^smartsell(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}

function response(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set(
    "Access-Control-Allow-Headers",
    "authorization, apikey, content-type, x-client-info",
  );
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(JSON.stringify(body), { status, headers });
}

function getKey(...names: string[]) {
  for (const name of names) {
    const raw = Deno.env.get(name);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
      if (parsed && typeof parsed === "object") {
        const values = Object.values(parsed).filter(
          (value): value is string => typeof value === "string",
        );
        if (typeof parsed.default === "string") return parsed.default;
        if (values.length === 1) return values[0];
      }
    } catch {
      return raw;
    }
  }
  return "";
}

async function blockLogin(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
) {
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
  });
  if (error) {
    throw new Error(`Could not permanently block a team login: ${error.message}`);
  }
}

async function listFiles(
  adminClient: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const filePaths: string[] = [];
  const pageSize = 100;
  let offset = 0;

  while (true) {
    const { data, error } = await adminClient.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Could not inspect ${bucket} files: ${error.message}`);
    if (!data.length) break;

    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        filePaths.push(...await listFiles(adminClient, bucket, path));
      } else {
        filePaths.push(path);
      }
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return filePaths;
}

async function removeTenantFiles(
  adminClient: ReturnType<typeof createClient>,
  businessId: string,
  memberIds: string[],
) {
  const { data: buckets, error: bucketError } =
    await adminClient.storage.listBuckets();
  if (bucketError) throw new Error(`Could not inspect storage buckets: ${bucketError.message}`);
  const availableBuckets = new Set(buckets.map((bucket) => bucket.id));
  const prefixesByBucket: Record<string, string[]> = {
    "smartsell-product-images": [businessId],
    "business-registration-evidence": memberIds.map(
      (memberId) => `${memberId}/${businessId}`,
    ),
    "business-payment-evidence": memberIds.map(
      (memberId) => `${memberId}/${businessId}`,
    ),
  };

  for (const [bucket, prefixes] of Object.entries(prefixesByBucket)) {
    if (!availableBuckets.has(bucket)) continue;
    for (const prefix of prefixes) {
      const paths = await listFiles(adminClient, bucket, prefix);
      for (let index = 0; index < paths.length; index += 100) {
        const { error } = await adminClient.storage
          .from(bucket)
          .remove(paths.slice(index, index + 100));
        if (error) {
          throw new Error(`Could not remove ${bucket} files: ${error.message}`);
        }
      }
    }
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return isAllowedOrigin(origin)
      ? response({}, 200, origin)
      : response({ error: "This app origin is not allowed." }, 403, origin);
  }
  if (request.method !== "POST") {
    return response({ error: "Method not allowed." }, 405, origin);
  }
  if (!isAllowedOrigin(origin)) {
    return response({ error: "This app origin is not allowed to delete records." }, 403, origin);
  }

  const token = request.headers
    .get("Authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return response({ error: "Sign in to continue." }, 401, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publicKey = getKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secretKey = getKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !publicKey || !secretKey) {
    return response({ error: "Secure deletion is not configured on the server." }, 500, origin);
  }

  const userClient = createClient(supabaseUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: authData, error: authError } =
      await userClient.auth.getUser(token);
    if (authError || !authData.user) {
      return response({ error: "Your session is invalid or expired. Sign in again." }, 401, origin);
    }

    const body = await request.json();
    if (body?.action === "delete_team_member") {
      if (
        typeof body.member_id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.member_id) ||
        body.confirmation !== "DELETE"
      ) {
        return response({ error: "Confirm the team member removal." }, 400, origin);
      }

      const { data: prepared, error: prepareError } = await userClient.rpc(
        "smartsell_team_delete_prepare",
        { command: { member_id: body.member_id, confirmation: body.confirmation } },
      );
      if (prepareError) return response({ error: prepareError.message }, 403, origin);

      await blockLogin(adminClient, prepared.member_id);
      const { error: deleteError } = await userClient.rpc(
        "smartsell_team_manage",
        { command: { action: "delete", member_id: prepared.member_id } },
      );
      if (deleteError) {
        return response({
          error: `Sign-in was blocked, but the Team record could not be removed. Retry the deletion: ${deleteError.message}`,
        }, 502, origin);
      }
      return response({ ok: true, member_id: prepared.member_id, login_blocked: true }, 200, origin);
    }

    if (
      body?.action !== "delete_tenant" ||
      typeof body.business_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.business_id) ||
      typeof body.confirmation !== "string"
    ) {
      return response({ error: "Provide a business and confirm its exact name." }, 400, origin);
    }

    const { data: prepared, error: prepareError } = await userClient.rpc(
      "smartsell_platform_tenant_delete_prepare",
      {
        command: {
          business_id: body.business_id,
          confirmation: body.confirmation,
        },
      },
    );
    if (prepareError) return response({ error: prepareError.message }, 403, origin);

    const memberIds = Array.isArray(prepared.member_ids)
      ? prepared.member_ids.filter((id: unknown): id is string => typeof id === "string")
      : [];
    const loginIds = Array.isArray(prepared.login_ids)
      ? prepared.login_ids.filter((id: unknown): id is string => typeof id === "string")
      : [];
    await removeTenantFiles(adminClient, prepared.business_id, memberIds);
    for (const memberId of loginIds) {
      await blockLogin(adminClient, memberId);
    }

    const { data: deleted, error: finalizeError } = await userClient.rpc(
      "smartsell_platform_tenant_delete_finalize",
      { command: { job_id: prepared.job_id } },
    );
    if (finalizeError) {
      return response({
        error: `The tenant is suspended and its logins are blocked, but database cleanup did not finish. Retry deletion: ${finalizeError.message}`,
      }, 502, origin);
    }

    return response({ ok: true, ...deleted }, 200, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deletion failed.";
    console.error("Permanent deletion failed:", message);
    return response({ error: message }, 500, origin);
  }
});

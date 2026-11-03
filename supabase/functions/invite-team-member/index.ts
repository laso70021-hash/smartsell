import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const configuredOrigins = [
  Deno.env.get("ALLOWED_ORIGINS"),
  Deno.env.get("APP_ORIGIN"),
  Deno.env.get("PUBLIC_APP_URL"),
  Deno.env.get("SITE_URL"),
].flatMap((value) => (value || "").split(",").map((item) => item.trim()).filter(Boolean));
const allowedOrigins = [...new Set(configuredOrigins)];
const defaultOrigin = Deno.env.get("APP_ORIGIN") || Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("SITE_URL");

function response(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (origin && allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set(
    "Access-Control-Allow-Headers",
    "authorization, apikey, content-type, x-client-info",
  );
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return response({}, 200, origin);
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405, origin);
  if (!origin || !allowedOrigins.includes(origin))
    return response({ error: "This app origin is not allowed to send invitations." }, 403, origin);

  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return response({ error: "Sign in as the business owner to invite team members." }, 401, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!supabaseUrl || !publishableKeys || !secretKeys)
    return response({ error: "Team invitations are not configured on the server." }, 500, origin);

  let publicKey: string;
  let secretKey: string;
  try {
    publicKey = JSON.parse(publishableKeys).default;
    secretKey = JSON.parse(secretKeys).default;
  } catch {
    return response({ error: "Supabase invitation keys are not configured correctly." }, 500, origin);
  }
  if (!publicKey || !secretKey)
    return response({ error: "Supabase invitation keys are missing." }, 500, origin);

  const userClient = createClient(supabaseUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user)
    return response({ error: "Your session is invalid or expired. Sign in again." }, 401, origin);

  const { data: member, error: identityError } =
    await userClient.rpc("smartsell_identity");
  if (identityError)
    return response({ error: `Could not verify your Smartsell role: ${identityError.message}` }, 403, origin);
  if (member?.role !== "owner")
    return response({ error: "Only a business owner can invite team members." }, 403, origin);

  let invitation: { email?: string; name?: string };
  try {
    const body = await request.json();
    if (
      !body ||
      typeof body.name !== "string" ||
      typeof body.email !== "string" ||
      typeof body.role !== "string" ||
      typeof body.branch_id !== "string"
    )
      return response({ error: "Provide a name, email, role, and branch." }, 400, origin);

    const { data, error } = await userClient.rpc("smartsell_team_invite", {
      command: body,
    });
    if (error) return response({ error: error.message }, 400, origin);
    invitation = data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid invitation request.";
    return response({ error: message }, 400, origin);
  }

  if (!invitation.email || !invitation.name)
    return response({ error: "The invitation record was created without a valid email or name." }, 500, origin);

  const inviterOrigin = defaultOrigin || origin;
  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    invitation.email,
    {
      data: { name: invitation.name },
      redirectTo: new URL("/login", inviterOrigin).toString(),
    },
  );
  if (inviteError) {
    console.error("Team invitation email could not be sent:", inviteError.code || inviteError.message);
    return response(
      {
        error: `The team invitation is saved, but Supabase could not send the email: ${inviteError.message}. Retry the invitation or ask the teammate to use their existing Supabase account.`,
        invitation_saved: true,
      },
      502,
      origin,
    );
  }

  return response(
    { ok: true, email: invitation.email, message: "Invitation email sent." },
    200,
    origin,
  );
});

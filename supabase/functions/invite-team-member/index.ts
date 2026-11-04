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
    headers.set("Access-Control-Allow-Origin", origin!);
    headers.set("Vary", "Origin");
  }
  headers.set(
    "Access-Control-Allow-Headers",
    "authorization, apikey, content-type, x-client-info, x-retry-count, traceparent, tracestate, baggage",
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

type TeamInvitation = {
  email?: string;
  name?: string;
  role?: string;
  branch_id?: string;
  account_status?: string;
  expires_at?: string | null;
  must_change_password?: boolean;
};

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return isAllowedOrigin(origin)
      ? response({}, 200, origin)
      : response({ error: "This app origin is not allowed." }, 403, origin);
  }
  if (request.method !== "POST")
    return response({ error: "Method not allowed." }, 405, origin);
  if (!isAllowedOrigin(origin))
    return response(
      { error: "This app origin is not allowed to manage team accounts." },
      403,
      origin,
    );

  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token)
    return response({ error: "Sign in to continue." }, 401, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publicKey = getKey(
    "SUPABASE_PUBLISHABLE_KEYS",
    "SUPABASE_ANON_KEY",
  );
  const secretKey = getKey(
    "SUPABASE_SECRET_KEYS",
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  if (!supabaseUrl || !publicKey || !secretKey)
    return response(
      { error: "Team account setup is not configured on the server." },
      500,
      origin,
    );

  const userClient = createClient(supabaseUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: userData, error: userError } =
      await userClient.auth.getUser(token);
    if (userError || !userData.user)
      return response(
        { error: "Your session is invalid or expired. Sign in again." },
        401,
        origin,
      );

    const body = await request.json();
    if (
      body?.action === "complete-password-change"
    ) {
      const password =
        typeof body.password === "string" ? body.password : "";
      if (password.length < 10)
        return response(
          { error: "Choose a password with at least 10 characters." },
          400,
          origin,
        );

      const { data: member, error: identityError } =
        await userClient.rpc("smartsell_identity");
      if (identityError || !member?.must_change_password)
        return response(
          { error: "This account does not require a temporary password change." },
          400,
          origin,
        );

      const { error: passwordError } =
        await adminClient.auth.admin.updateUserById(userData.user.id, {
          password,
        });
      if (passwordError)
        return response({ error: passwordError.message }, 400, origin);

      const { error: completionError } = await adminClient.rpc(
        "smartsell_complete_password_setup",
        { target_user: userData.user.id },
      );
      if (completionError) {
        console.error(
          "Temporary password flag could not be cleared:",
          completionError.code || completionError.message,
        );
        return response(
          { error: "Password updated, but account setup could not be completed. Try again." },
          500,
          origin,
        );
      }
      return response({ ok: true }, 200, origin);
    }

    const { data: member, error: identityError } =
      await userClient.rpc("smartsell_identity");
    if (identityError)
      return response(
        { error: `Could not verify your account: ${identityError.message}` },
        403,
        origin,
      );
    if (member?.role !== "owner")
      return response(
        { error: "Only a business owner can manage team members." },
        403,
        origin,
      );

    if (
      !body ||
      typeof body.name !== "string" ||
      typeof body.email !== "string" ||
      typeof body.role !== "string" ||
      typeof body.branch_id !== "string"
    )
      return response(
        { error: "Provide a name, email, role, and branch." },
        400,
        origin,
      );

    const setupMethod = body.setup_method === "manual" ? "manual" : "invite";
    const password =
      typeof body.password === "string" ? body.password : "";
    if (setupMethod === "manual" && password.length < 10)
      return response(
        { error: "Enter a temporary password with at least 10 characters." },
        400,
        origin,
      );

    const { data: invitationData, error: invitationError } =
      await userClient.rpc("smartsell_team_invite", {
        command: {
          name: body.name,
          email: body.email,
          role: body.role,
          branch_id: body.branch_id,
          account_status: body.account_status,
          expires_at: body.expires_at,
          setup_method: setupMethod,
        },
      });
    if (invitationError)
      return response({ error: invitationError.message }, 400, origin);
    const invitation = invitationData as TeamInvitation;
    if (!invitation.email || !invitation.name)
      return response(
        { error: "The team invitation could not be saved." },
        500,
        origin,
      );

    const redirectOrigin = origin || "https://smartsell.swahivo.com";
    const { data: invitedUser, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(invitation.email, {
        data: { name: invitation.name },
        redirectTo: new URL("/login", redirectOrigin).toString(),
      });
    if (inviteError) {
      console.error(
        "Team invitation email could not be sent:",
        inviteError.code || inviteError.message,
      );
      return response(
        {
          error: `The invitation was saved, but the confirmation email could not be sent: ${inviteError.message}.`,
          invitation_saved: true,
        },
        502,
        origin,
      );
    }

    if (setupMethod === "manual" && invitedUser.user) {
      const { error: passwordError } =
        await adminClient.auth.admin.updateUserById(invitedUser.user.id, {
          password,
        });
      if (passwordError) {
        console.error(
          "Temporary team password could not be set:",
          passwordError.code || passwordError.message,
        );
        return response(
          {
            error: `The confirmation email was sent, but the temporary password could not be set: ${passwordError.message}.`,
            invitation_saved: true,
          },
          502,
          origin,
        );
      }
    }

    return response(
      {
        ok: true,
        email: invitation.email,
        setup_method: setupMethod,
        message: "Confirmation invitation sent.",
      },
      200,
      origin,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Team account setup failed.";
    console.error("Team account setup failed:", message);
    return response({ error: message }, 500, origin);
  }
});

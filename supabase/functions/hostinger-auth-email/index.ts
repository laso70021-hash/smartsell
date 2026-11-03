import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

type AuthEmailEvent = {
  user?: { email?: string };
  email_data?: {
    token?: string;
    token_hash?: string;
    token_hash_new?: string;
    redirect_to?: string;
    site_url?: string;
    email_action_type?: string;
  };
};

const actions: Record<string, { subject: string; heading: string; button: string }> = {
  signup: { subject: "Confirm your Smartsell account", heading: "Welcome to Smartsell", button: "Confirm your email address" },
  invite: { subject: "Your Smartsell team invitation", heading: "You have been invited to Smartsell", button: "Accept invitation" },
  magiclink: { subject: "Sign in to Smartsell", heading: "Sign in to Smartsell", button: "Sign in" },
  recovery: { subject: "Reset your Smartsell password", heading: "Reset your password", button: "Reset password" },
  email_change: { subject: "Confirm your Smartsell email change", heading: "Confirm your email change", button: "Confirm email change" },
  email_change_new: { subject: "Confirm your Smartsell email change", heading: "Confirm your email change", button: "Confirm email change" },
  email: { subject: "Verify your Smartsell email", heading: "Verify your email address", button: "Verify email" },
  reauthentication: { subject: "Verify your Smartsell identity", heading: "Verify your identity", button: "Verify identity" },
};

const notifications: Record<string, string> = {
  password_changed_notification: "Your Smartsell password was changed",
  email_changed_notification: "Your Smartsell email was changed",
  phone_changed_notification: "Your Smartsell phone number was changed",
  identity_linked_notification: "A sign-in method was added to Smartsell",
  identity_unlinked_notification: "A sign-in method was removed from Smartsell",
  mfa_factor_enrolled_notification: "Multi-factor authentication was enabled",
  mfa_factor_unenrolled_notification: "Multi-factor authentication was disabled",
};

type MailboxResponse = { data?: { mailboxes?: Array<{ resourceId?: string }> } };
let cachedMailboxId: string | undefined;

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`);
  return value;
}

async function getMailboxId(token: string) {
  const configured = Deno.env.get("HOSTINGER_MAILBOX_RESOURCE_ID");
  if (configured) return configured;
  if (cachedMailboxId) return cachedMailboxId;
  const response = await fetch("https://api.mail.hostinger.com/api/v1/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Hostinger mailbox lookup failed with HTTP ${response.status}`);
  const account = (await response.json()) as MailboxResponse;
  const boxes = account.data?.mailboxes ?? [];
  if (boxes.length !== 1 || !boxes[0]?.resourceId) {
    throw new Error("Hostinger token must have access to one mailbox, or set HOSTINGER_MAILBOX_RESOURCE_ID.");
  }
  cachedMailboxId = boxes[0].resourceId;
  return cachedMailboxId;
}

function escapeHtml(value: string) {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

function emailContent(event: AuthEmailEvent) {
  const email = event.user?.email?.trim();
  const data = event.email_data;
  const type = data?.email_action_type;
  if (!email || !type) throw new Error("Auth hook payload is missing the email or action type.");
  const action = actions[type];
  const subject = action?.subject ?? notifications[type];
  if (!subject) throw new Error(`Unsupported Auth email action: ${type}`);

  const hash = type === "email_change" || type === "email_change_new"
    ? data.token_hash_new || data.token_hash
    : data.token_hash;
  let link: string | undefined;
  if (hash) {
    const url = new URL("/auth/v1/verify", env("SUPABASE_URL"));
    url.searchParams.set("token", hash);
    url.searchParams.set("type", type === "email_change_new" ? "email_change" : type);
    const redirect = data.redirect_to || data.site_url;
    if (redirect) url.searchParams.set("redirect_to", redirect);
    link = url.toString();
  }
  const heading = action?.heading ?? subject;
  if (!link && action && data.token) {
    return {
      email, subject,
      text: `${heading}\n\nYour verification code is: ${data.token}`,
      html: `<h1>${escapeHtml(heading)}</h1><p>Your verification code is <strong>${escapeHtml(data.token)}</strong>.</p>`,
    };
  }
  if (action && !link) throw new Error(`Auth hook payload has no verification token for ${type}.`);
  const button = action?.button ?? "Review your account";
  return {
    email, subject,
    text: link
      ? `${heading}\n\n${button}: ${link}\n\nIf you did not request this, ignore this email.`
      : `${heading}\n\nIf you did not make this change, secure your Smartsell account and contact your business administrator.`,
    html: link
      ? `<h1>${escapeHtml(heading)}</h1><p><a href="${escapeHtml(link)}">${escapeHtml(button)}</a></p><p>If you did not request this, ignore this email.</p>`
      : `<h1>${escapeHtml(heading)}</h1><p>If you did not make this change, secure your Smartsell account and contact your business administrator.</p>`,
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: { http_code: 405, message: "Method not allowed." } }, { status: 405 });
  }
  let event: AuthEmailEvent;
  try {
    const secrets = env("SEND_EMAIL_HOOK_SECRETS").split("|").map((item) => {
      const match = item.trim().match(/^v1,whsec_(.+)$/);
      if (!match) throw new Error("Auth email hook secret has an invalid format.");
      return match[1];
    });
    const payload = await request.text();
    const headers = Object.fromEntries(request.headers);
    let verified: unknown;
    for (const secret of secrets) {
      try {
        verified = new Webhook(secret).verify(payload, headers);
        break;
      } catch {
        // Try the next secret to support hook-secret rotation.
      }
    }
    if (!verified) throw new Error("Auth email hook signature verification failed.");
    event = verified as AuthEmailEvent;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Auth email hook request.";
    const status = message.includes("signature verification") ? 401 : 400;
    return Response.json({ error: { http_code: status, message } }, { status });
  }

  try {
    const token = env("hostinger_email_api");
    const content = emailContent(event);
    const id = await getMailboxId(token);
    const { email, ...message } = content;
    const payload: Record<string, unknown> = {
      to: [email],
      subject: message.subject,
    };
    if (message.text) payload.text = message.text;
    if (message.html) payload.html = message.html;
    const fromAddress = Deno.env.get("HOSTINGER_FROM_EMAIL");
    if (fromAddress) payload.from = fromAddress;

    const response = await fetch(
      `https://api.mail.hostinger.com/api/v1/mailboxes/${encodeURIComponent(id)}/send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) throw new Error(`Hostinger email delivery failed with HTTP ${response.status}`);
    return Response.json({}, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send the authentication email.";
    console.error("Smartsell Auth email delivery failed:", message);
    return Response.json({ error: { http_code: 500, message } }, { status: 500 });
  }
});

import express from "express";
import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { z } from "zod";
import { openDatabase, isAccountActive } from "./db.mjs";
const text = z.string().trim().min(1).max(200);
const optional = z.string().trim().max(500).default("");
const amount = z.number().int().min(0).max(1_000_000_000);
const quantity = z
  .number()
  .positive()
  .max(100_000)
  .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-8, "Use up to three decimal places.");
const quantityDelta = z
  .number()
  .min(-100_000)
  .max(100_000)
  .refine((v) => v !== 0 && Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-8, "Use a non-zero quantity with up to three decimal places.");
const validQuantity = (v) =>
  Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-8;
const email = z
  .email()
  .max(200)
  .transform((v) => v.toLowerCase());
const currency = z
  .string()
  .refine(
    (v) => Intl.supportedValuesOf("currency").includes(v),
    "Select a supported ISO currency code.",
  );
const businessCategories = [
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
const uuid = z.uuid();
const SYSTEM_ADMIN_IDS = new Set(["0706ee20-d730-4a3e-bfaf-db0547cb3da5"]);
const hash = (v) => createHash("sha256").update(v).digest("hex");
const quantityMilli = (v) => Math.round(v * 1000);
const quantityAmount = (unitPrice, quantityMilliValue) =>
  Number(
    (BigInt(unitPrice) * BigInt(quantityMilliValue) + 500n) / 1000n,
  );
const passwordHash = (v) => {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(v, salt, 64).toString("hex");
};
const passwordCheck = (v, h) => {
  const [salt, key] = h.split(":");
  return timingSafeEqual(Buffer.from(key, "hex"), scryptSync(v, salt, 64));
};
const safeUser = ({ password, ...user }) => user;
export function createApp({
  dbPath = "data/dukapro.db",
  serveStatic = true,
} = {}) {
  const db = openDatabase(dbPath),
    app = express();
  const get = (sql, ...args) => db.prepare(sql).get(...args),
    all = (sql, ...args) => db.prepare(sql).all(...args),
    run = (sql, ...args) => db.prepare(sql).run(...args);
  const fail = (message, status = 400) => {
    throw Object.assign(new Error(message), { status });
  };
  const tx = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const now = () => new Date().toISOString();
  const branch = (u, id) => {
    const b = get(
      "SELECT * FROM branches WHERE id=? AND business_id=? AND active=1",
      id,
      u.business_id,
    );
    if (!b || (!isOwnerOrAdmin(u) && u.branch_id !== id))
      fail("Branch access denied.", 403);
    return b;
  };
  const owned = (table, id, u) => {
    const record =
      table === "businesses"
        ? get("SELECT * FROM businesses WHERE id=? AND id=?", id, u.business_id)
        : get(
            `SELECT * FROM ${table} WHERE id=? AND business_id=?`,
            id,
            u.business_id,
          );
    if (!record) fail("Record not found.", 404);
    return record;
  };
  const isSystemAdmin = (u) => Boolean(u?.is_admin) || SYSTEM_ADMIN_IDS.has(u?.id);
  const isOwnerOrAdmin = (u) => u.role === "owner" || isSystemAdmin(u);
  const canManageStaff = (u) => u.role === "owner" || isSystemAdmin(u);
  const role = (u, roles) => {
    if (!roles.includes(u.role) && !isSystemAdmin(u))
      fail("Your role does not permit this action.", 403);
  };
  const event = (u, b, category, entity, description, reference, amount = 0) =>
    run(
      "INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?)",
      randomUUID(),
      u.business_id,
      b,
      u.id,
      category,
      entity,
      description,
      reference,
      amount,
      now(),
    );
  const movement = (u, b, p, delta, reason, ref, variantId = null) => {
    const deltaMilli = quantityMilli(delta);
    const oldMilli = variantId
      ? get(
          "SELECT quantity_milli FROM variant_stock WHERE variant_id=? AND branch_id=?",
          variantId,
          b,
        )?.quantity_milli || 0
      : get(
          "SELECT quantity_milli FROM stock WHERE product_id=? AND branch_id=?",
          p,
          b,
        )?.quantity_milli || 0;
    if (oldMilli + deltaMilli < 0)
      fail("Insufficient stock. Refresh the cart and try again.", 409);
    if (oldMilli + deltaMilli > 100_000_000_000)
      fail("Stock exceeds the supported quantity.");
    const nextMilli = oldMilli + deltaMilli,
      next = nextMilli / 1000;
    if (variantId)
      run(
        "INSERT INTO variant_stock(variant_id,branch_id,quantity,quantity_milli) VALUES(?,?,?,?) ON CONFLICT(variant_id,branch_id) DO UPDATE SET quantity=excluded.quantity,quantity_milli=excluded.quantity_milli",
        variantId,
        b,
        next,
        nextMilli,
      );
    else
      run(
        "INSERT INTO stock(product_id,branch_id,quantity,quantity_milli) VALUES(?,?,?,?) ON CONFLICT(product_id,branch_id) DO UPDATE SET quantity=excluded.quantity,quantity_milli=excluded.quantity_milli",
        p,
        b,
        next,
        nextMilli,
      );
    run(
      "INSERT INTO movements(id,business_id,branch_id,product_id,delta,reason,reference,created_at,delta_milli,variant_id) VALUES(?,?,?,?,?,?,?,?,?,?)",
      randomUUID(),
      u.business_id,
      b,
      p,
      deltaMilli / 1000,
      reason,
      ref,
      now(),
      deltaMilli,
      variantId,
    );
  };
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
      "Cache-Control": "no-store",
    });
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      const allowedOrigins = [
        process.env.APP_ORIGIN,
        process.env.PUBLIC_APP_URL,
        process.env.SITE_URL,
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        `http://127.0.0.1:${process.env.PORT || 3001}`,
        `http://localhost:${process.env.PORT || 3001}`,
      ].filter(Boolean);
      if (origin && !allowedOrigins.includes(origin))
        return res.status(403).json({ error: "Request origin denied." });
      if (!req.is("application/json"))
        return res.status(415).json({ error: "JSON content type required." });
    }
    next();
  });
  const cookie = (res, token) =>
    res.cookie("dukapro_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 86400000,
      path: "/",
    });
  const session = (res, id) => {
    const token = randomBytes(32).toString("hex");
    run("DELETE FROM sessions WHERE expires<?", Date.now());
    run(
      "INSERT INTO sessions VALUES(?,?,?)",
      hash(token),
      id,
      Date.now() + 7 * 86400000,
    );
    cookie(res, token);
  };
  const attempts = new Map();
  const rateLimit = (req, res, next) => {
    const key = req.ip;
    const a = attempts.get(key) || { count: 0, until: Date.now() + 900000 };
    if (a.until < Date.now()) {
      a.count = 0;
      a.until = Date.now() + 900000;
    }
    if (++a.count > 30)
      return res
        .status(429)
        .json({ error: "Too many attempts. Try again in 15 minutes." });
    attempts.set(key, a);
    if (attempts.size > 10000)
      for (const [k, v] of attempts)
        if (v.until < Date.now()) attempts.delete(k);
    next();
  };
  app.post("/api/auth/register", rateLimit, (req, res) => {
    const v = z
      .object({
        name: text,
        email,
        password: z.string().min(10).max(200),
        business: text,
        currency: currency.default("TZS"),
        country: text,
        timezone: text,
        branch: text,
        category: z.enum(businessCategories).default("Retail"),
        custom_category: optional,
      })
      .parse(req.body);
    if (v.category === "Other" && !v.custom_category)
      fail("Enter your business category.");
    try {
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: v.currency || "TZS",
      });
      new Intl.DateTimeFormat("en", { timeZone: v.timezone });
    } catch {
      fail("Invalid currency or timezone.");
    }
    if (get("SELECT id FROM users WHERE email=?", v.email))
      fail("This email is already registered.", 409);
    const id = tx(() => {
      const b = randomUUID(),
        br = randomUUID(),
        u = randomUUID();
      run(
        "INSERT INTO businesses(id,name,currency,country,timezone,category,custom_category) VALUES(?,?,?,?,?,?,?)",
        b,
        v.business,
        v.currency,
        v.country,
        v.timezone,
        v.category,
        v.category === "Other" ? v.custom_category : "",
      );
      run(
        "INSERT INTO branches(id,business_id,name,is_default) VALUES(?,?,?,1)",
        br,
        b,
        v.branch,
      );
      run(
        "INSERT INTO users(id,business_id,branch_id,name,email,password,role,active,account_status,expires_at,is_admin,theme) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        u,
        b,
        br,
        v.name,
        v.email,
        passwordHash(v.password),
        "owner",
        1,
        "active",
        null,
        0,
        "dark",
      );
      return u;
    });
    session(res, id);
    res
      .status(201)
      .json({ user: safeUser(get("SELECT * FROM users WHERE id=?", id)) });
  });
  app.post("/api/auth/login", rateLimit, (req, res) => {
    const v = z
      .object({ email, password: z.string().min(1).max(200) })
      .parse(req.body);
    const u = get("SELECT * FROM users WHERE email=?", v.email);
    if (!u || !passwordCheck(v.password, u.password) || !isAccountActive(u))
      fail("Email or password is incorrect.", 401);
    session(res, u.id);
    res.json({ user: safeUser(u) });
  });
  app.use("/api", (req, res, next) => {
    const raw = req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("dukapro_session="))
      ?.slice(16);
    const u =
      raw &&
      get(
        "SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token=? AND sessions.expires>?",
        hash(raw),
        Date.now(),
      );
    if (!u || !isAccountActive(u))
      return res.status(401).json({ error: "Sign in to continue." });
    req.user = u;
    next();
  });
  app.get("/api/auth/me", (req, res) => res.json({ user: safeUser(req.user) }));
  app.post("/api/auth/logout", (req, res) => {
    run("DELETE FROM sessions WHERE user_id=?", req.user.id);
    res.clearCookie("dukapro_session", { path: "/" });
    res.json({ ok: true });
  });
  app.get("/api/admin/overview", (req, res) => {
    if (!isSystemAdmin(req.user))
      fail("Platform admin access required.", 403);
    const businesses = all(
      `SELECT b.*, COUNT(u.id) AS member_count,
              SUM(CASE WHEN u.active=1 AND (u.account_status IS NULL OR u.account_status='active') THEN 1 ELSE 0 END) AS active_members,
              SUM(CASE WHEN u.is_admin=1 OR u.id=? THEN 1 ELSE 0 END) AS owner_count
       FROM businesses b
       LEFT JOIN users u ON u.business_id=b.id
       GROUP BY b.id
       ORDER BY b.name`,
      SYSTEM_ADMIN_IDS.has(req.user.id) ? req.user.id : "",
    );
    const users = all(
      `SELECT u.*, b.name AS business_name, br.name AS branch_name
       FROM users u
       JOIN businesses b ON b.id=u.business_id
       JOIN branches br ON br.id=u.branch_id AND br.business_id=u.business_id
       ORDER BY u.name`,
    );
    const activeCount = users.filter((u) => isAccountActive(u)).length;
    const suspendedCount = users.filter((u) => (u.account_status || "active") === "suspended").length;
    const recent = all(
      `SELECT e.*, u.name AS actor_name, b.name AS business_name
       FROM events e
       JOIN users u ON u.id=e.actor_id
       JOIN businesses b ON b.id=e.business_id
       ORDER BY e.created_at DESC LIMIT 20`,
    );
    res.json({
      stats: {
        businesses: businesses.length,
        users: users.length,
        active: activeCount,
        suspended: suspendedCount,
      },
      businesses,
      users,
      recent,
    });
  });
  app.get("/api/admin/users", (req, res) => {
    if (!isSystemAdmin(req.user))
      fail("Platform admin access required.", 403);
    const users = all(
      `SELECT u.*, b.name AS business_name, br.name AS branch_name
       FROM users u
       JOIN businesses b ON b.id=u.business_id
       JOIN branches br ON br.id=u.branch_id AND br.business_id=u.business_id
       ORDER BY u.name`,
    );
    res.json({ users });
  });
  app.put("/api/admin/users/:id", (req, res) => {
    if (!isSystemAdmin(req.user))
      fail("Platform admin access required.", 403);
    const v = z
      .object({
        name: text.optional(),
        email: email.optional(),
        role: z.enum(["owner", "manager", "cashier"]).optional(),
        business_id: uuid.optional(),
        branch_id: uuid.optional(),
        account_status: z.enum(["active", "suspended", "pending"]).optional(),
        expires_at: z.string().optional(),
        active: z.boolean().optional(),
        is_admin: z.boolean().optional(),
        password: z.string().min(10).max(200).optional(),
      })
      .parse(req.body);
    const member = get("SELECT * FROM users WHERE id=?", req.params.id);
    if (!member) fail("User not found.", 404);
    if (v.business_id) {
      const business = get("SELECT id FROM businesses WHERE id=?", v.business_id);
      if (!business) fail("Business not found.", 404);
    }
    if (v.branch_id) {
      const branchRow = get(
        "SELECT id FROM branches WHERE id=? AND business_id=?",
        v.branch_id,
        v.business_id || member.business_id,
      );
      if (!branchRow) fail("Branch not found.", 404);
    }
    const nextBusinessId = v.business_id || member.business_id;
    const nextBranchId = v.branch_id || member.branch_id;
    const nextStatus = v.account_status || member.account_status || "active";
    const nextActive = v.active ?? Number(member.active ?? 0) === 1;
    const nextExpires =
      v.expires_at === undefined ? member.expires_at : v.expires_at && v.expires_at.trim() ? v.expires_at : null;
    const nextPassword = v.password ? passwordHash(v.password) : member.password;
    const nextIsAdmin = v.is_admin === undefined ? Number(member.is_admin ?? 0) === 1 : v.is_admin ? 1 : 0;
    const nextRole = v.role || member.role;
    tx(() => {
      run(
        "UPDATE users SET name=COALESCE(?, name), email=COALESCE(?, email), role=COALESCE(?, role), business_id=COALESCE(?, business_id), branch_id=COALESCE(?, branch_id), active=?, account_status=?, expires_at=?, is_admin=?, password=? WHERE id=?",
        v.name || null,
        v.email || null,
        v.role || null,
        v.business_id || null,
        v.branch_id || null,
        nextActive ? 1 : 0,
        nextStatus,
        nextExpires,
        nextIsAdmin,
        nextPassword,
        member.id,
      );
      run("DELETE FROM sessions WHERE user_id=?", member.id);
      event(
        req.user,
        nextBranchId,
        "Platform",
        member.name,
        `User updated by platform admin; account status ${nextStatus}`,
        member.id,
      );
    });
    res.json({ ok: true, user: safeUser(get("SELECT * FROM users WHERE id=?", member.id)) });
  });
  app.post("/api/admin/users/:id/toggle", (req, res) => {
    if (!isSystemAdmin(req.user))
      fail("Platform admin access required.", 403);
    const member = get("SELECT * FROM users WHERE id=?", req.params.id);
    if (!member) fail("User not found.", 404);
    const nextStatus = member.account_status === "active" ? "suspended" : "active";
    tx(() => {
      run(
        "UPDATE users SET active=?, account_status=? WHERE id=?",
        nextStatus === "active" ? 1 : 0,
        nextStatus,
        member.id,
      );
      run("DELETE FROM sessions WHERE user_id=?", member.id);
      event(
        req.user,
        member.branch_id,
        "Platform",
        member.name,
        nextStatus === "active" ? "User re-enabled by platform admin" : "User suspended by platform admin",
        member.id,
      );
    });
    res.json({ ok: true });
  });
  app.delete("/api/admin/users/:id", (req, res) => {
    if (!isSystemAdmin(req.user))
      fail("Platform admin access required.", 403);
    const member = get("SELECT * FROM users WHERE id=?", req.params.id);
    if (!member) fail("User not found.", 404);
    tx(() => {
      run("DELETE FROM sessions WHERE user_id=?", member.id);
      run("DELETE FROM users WHERE id=?", member.id);
      event(
        req.user,
        member.branch_id,
        "Platform",
        member.name,
        "User deleted by platform admin",
        member.id,
      );
    });
    res.json({ ok: true, deleted: member.email });
  });
  app.get("/api/workspace", (req, res) => {
    const u = req.user,
      b = String(req.query.branch || u.branch_id);
    branch(u, b);
    const isCashier = u.role === "cashier";
    const products = all(
      `SELECT p.*,COALESCE(s.quantity,0) stock FROM products p LEFT JOIN stock s ON s.product_id=p.id AND s.branch_id=? WHERE p.business_id=? AND p.active=1 ORDER BY p.name`,
      b,
      u.business_id,
    ).map((p) => ({
      ...p,
      variants: all(
        "SELECT v.*,COALESCE(s.quantity,0) stock FROM product_variants v LEFT JOIN variant_stock s ON s.variant_id=v.id AND s.branch_id=? WHERE v.product_id=? AND v.active=1 ORDER BY v.name",
        b,
        p.id,
      ),
    }));
    const sales = all(
      `SELECT s.*,u.name actor,COALESCE(p.name,'Walk-in customer') customer FROM sales s JOIN users u ON u.id=s.actor_id LEFT JOIN parties p ON p.id=s.customer_id WHERE s.business_id=? AND s.branch_id=? ${isCashier ? "AND s.actor_id=?" : ""} ORDER BY s.created_at DESC`,
      ...[u.business_id, b, ...(isCashier ? [u.id] : [])],
    );
    const items = all(
      `SELECT i.* FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.business_id=? AND s.branch_id=? ${isCashier ? "AND s.actor_id=?" : ""}`,
      u.business_id,
      b,
      ...(isCashier ? [u.id] : []),
    );
    res.json({
      user: safeUser(u),
      business: owned("businesses", u.business_id, {
        business_id: u.business_id,
      }),
      branches: all(
        `SELECT * FROM branches WHERE business_id=? ${isCashier ? "AND id=?" : ""} ORDER BY is_default DESC,name`,
        u.business_id,
        ...(isCashier ? [u.branch_id] : []),
      ),
      products: products.map((p) =>
        isCashier
          ? {
              ...p,
              cost: 0,
              variants: p.variants.map((v) => ({ ...v, cost: 0 })),
            }
          : p,
      ),
      sales,
      items: items.map((i) => (isCashier ? { ...i, cost: 0 } : i)),
      parties: all(
        `SELECT p.* FROM parties p WHERE p.business_id=? ${isCashier ? "AND kind='customer'" : ""} ORDER BY name`,
        u.business_id,
      ),
      purchases: isCashier
        ? []
        : all(
            "SELECT o.*,p.name || CASE WHEN v.name IS NULL THEN '' ELSE ' · ' || v.name END product,s.name supplier FROM purchases o JOIN products p ON p.id=o.product_id LEFT JOIN product_variants v ON v.id=o.variant_id JOIN parties s ON s.id=o.supplier_id WHERE o.business_id=? AND o.branch_id=? ORDER BY o.created_at DESC",
            u.business_id,
            b,
          ),
      expenses: isCashier
        ? []
        : all(
            "SELECT * FROM expenses WHERE business_id=? AND branch_id=? ORDER BY date DESC",
            u.business_id,
            b,
          ),
      events: isCashier
        ? []
        : all(
            "SELECT e.*,u.name actor FROM events e JOIN users u ON u.id=e.actor_id WHERE e.business_id=? AND (e.branch_id=? OR e.branch_id IS NULL) ORDER BY e.created_at DESC LIMIT 2000",
            u.business_id,
            b,
          ),
      movements: isCashier
        ? []
        : all(
            "SELECT * FROM movements WHERE business_id=? AND branch_id=? ORDER BY created_at DESC",
            u.business_id,
            b,
          ),
      staff:
        isOwnerOrAdmin(u)
          ? all(
              "SELECT id,name,email,role,branch_id,active,account_status,expires_at FROM users WHERE business_id=? ORDER BY name",
              u.business_id,
            )
          : [],
      exports: isCashier
        ? []
        : all(
            "SELECT id,name,scope,created_at FROM exports WHERE business_id=? AND branch_id=? ORDER BY created_at DESC",
            u.business_id,
            b,
          ),
    });
  });
      app.get("/api/cashier-shifts", (req, res) => {
        const u = req.user;
        if (req.query.scope === "active") {
          if (u.role !== "cashier") return res.json({ shift: null });
          const shift = get(
            "SELECT * FROM cashier_shifts WHERE cashier_id=? AND closed_at IS NULL",
            u.id,
          );
          return res.json({ shift: shift || null });
        }
        role(u, ["owner", "manager"]);
        const branchId = String(req.query.branch || u.branch_id);
        branch(u, branchId);
        const cashierId = String(req.query.cashier || "");
        if (cashierId && !get(
          "SELECT id FROM users WHERE id=? AND business_id=? AND role='cashier'",
          cashierId,
          u.business_id,
        )) fail("Cashier not found.", 404);
        const shifts = all(
          `SELECT s.*,u.name cashier FROM cashier_shifts s JOIN users u ON u.id=s.cashier_id
           WHERE s.business_id=? AND s.branch_id=? AND s.closed_at IS NOT NULL
           ${cashierId ? "AND s.cashier_id=?" : ""} ORDER BY s.closed_at DESC`,
          ...[u.business_id, branchId, ...(cashierId ? [cashierId] : [])],
        ).map((shift) => ({ ...shift, report: JSON.parse(shift.report || "{}") }));
        res.json({ shifts });
      });
      app.post("/api/cashier-shifts", (req, res) => {
        const u = req.user;
        const body = z.object({
          action: z.enum(["open", "close"]),
          opening_cash: amount.optional(),
          counted_cash: amount.optional(),
        }).parse(req.body);
        role(u, ["cashier"]);
        const activeBranch = branch(u, u.branch_id);
        if (body.action === "open") {
          if (body.opening_cash === undefined) fail("Enter the opening cash amount.");
          const shift = tx(() => {
            if (get("SELECT id FROM cashier_shifts WHERE cashier_id=? AND closed_at IS NULL", u.id))
              fail("You already have an open shift.", 409);
            const record = {
              id: randomUUID(),
              business_id: u.business_id,
              branch_id: activeBranch.id,
              cashier_id: u.id,
              opened_at: now(),
              opening_cash: body.opening_cash,
            };
            run(
              "INSERT INTO cashier_shifts(id,business_id,branch_id,cashier_id,opened_at,opening_cash) VALUES(?,?,?,?,?,?)",
              record.id,
              record.business_id,
              record.branch_id,
              record.cashier_id,
              record.opened_at,
              record.opening_cash,
            );
            event(u, activeBranch.id, "Cashier shifts", u.name, "Shift opened", record.id, record.opening_cash);
            return record;
          });
          return res.status(201).json({ shift });
        }
        if (body.counted_cash === undefined) fail("Enter the counted cash amount.");
        const closed = tx(() => {
          const shift = get(
            "SELECT * FROM cashier_shifts WHERE cashier_id=? AND closed_at IS NULL",
            u.id,
          );
          if (!shift) fail("Open a shift before submitting a reconciliation.", 409);
          const sales = all(
            "SELECT * FROM sales WHERE shift_id=? AND status='completed' ORDER BY created_at",
            shift.id,
          );
          const soldItems = new Map();
          const saleReports = sales.map((sale) => {
            const saleItems = all("SELECT * FROM sale_items WHERE sale_id=?", sale.id);
            for (const item of saleItems) {
              const current = soldItems.get(item.product_id) || {
                id: item.product_id,
                product_id: item.product_id,
                name: item.name,
                sku: item.sku,
                quantity: 0,
                total: 0,
              };
              current.quantity += item.quantity;
              current.total += quantityAmount(
                item.price,
                item.quantity_milli || quantityMilli(item.quantity),
              );
              soldItems.set(item.product_id, current);
            }
            return {
              id: sale.id,
              reference: sale.reference,
              created_at: sale.created_at,
              total: sale.total,
              paid: sale.paid,
              method: sale.method,
              items: saleItems.map(({ name, sku, quantity, price }) => ({ name, sku, quantity, price })),
            };
          });
          const salesTotal = sales.reduce((sum, sale) => sum + sale.total, 0);
          const expectedCash = shift.opening_cash + sales
            .filter((sale) => sale.method === "cash")
            .reduce((sum, sale) => sum + sale.paid, 0);
          const report = { sales: saleReports, items: [...soldItems.values()] };
          const closedAt = now();
          const variance = body.counted_cash - expectedCash;
          run(
            "UPDATE cashier_shifts SET closed_at=?,expected_cash=?,counted_cash=?,variance=?,sales_count=?,sales_total=?,report=? WHERE id=?",
            closedAt,
            expectedCash,
            body.counted_cash,
            variance,
            sales.length,
            salesTotal,
            JSON.stringify(report),
            shift.id,
          );
          event(u, shift.branch_id, "Cashier shifts", u.name, "Shift reconciliation submitted", shift.id, variance);
          return {
            ...shift,
            closed_at: closedAt,
            expected_cash: expectedCash,
            counted_cash: body.counted_cash,
            variance,
            sales_count: sales.length,
            sales_total: salesTotal,
            report,
          };
        });
        res.json({ shift: closed });
      });
  const productSchema = z.object({
    name: text,
    sku: text,
    barcode: optional,
    category: text,
    unit: text,
    cost: amount,
    price: amount,
    threshold: z.number().min(0).max(100000).refine(validQuantity),
  });
  app.post("/api/products/import", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const v = z
      .object({
        branch_id: uuid,
        products: z
          .array(
            productSchema.extend({
              stock: z.number().min(0).max(100000).refine(validQuantity),
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(req.body);
    branch(u, v.branch_id);
    tx(() => {
      for (const p of v.products) {
        const id = randomUUID();
        run(
          "INSERT INTO products(id,business_id,name,sku,barcode,category,unit,cost,price,threshold) VALUES(?,?,?,?,?,?,?,?,?,?)",
          id,
          u.business_id,
          p.name,
          p.sku,
          p.barcode,
          p.category,
          p.unit,
          p.cost,
          p.price,
          p.threshold,
        );
        movement(u, v.branch_id, id, p.stock, "CSV opening stock", id);
      }
      event(
        u,
        v.branch_id,
        "Products",
        "CSV import",
        `${v.products.length} products imported`,
        randomUUID(),
        v.products.reduce((n, p) => n + p.stock, 0),
      );
    });
    res.status(201).json({ count: v.products.length });
  });
  app.post("/api/products", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const v = productSchema
      .extend({
        branch_id: uuid,
        stock: z.number().min(0).max(100000).refine(validQuantity),
      })
      .parse(req.body);
    branch(u, v.branch_id);
    const id = tx(() => {
      const id = randomUUID();
      run(
        "INSERT INTO products(id,business_id,name,sku,barcode,category,unit,cost,price,threshold) VALUES(?,?,?,?,?,?,?,?,?,?)",
        id,
        u.business_id,
        v.name,
        v.sku,
        v.barcode,
        v.category,
        v.unit,
        v.cost,
        v.price,
        v.threshold,
      );
      movement(u, v.branch_id, id, v.stock, "Opening stock", id);
      event(
        u,
        v.branch_id,
        "Products",
        v.name,
        "Product created with opening stock",
        v.sku,
        v.stock,
      );
      return id;
    });
    res.status(201).json({ id });
  });
  app.put("/api/products/:id", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const v = productSchema.parse(req.body);
    owned("products", req.params.id, u);
    tx(() => {
      run(
        "UPDATE products SET name=?,sku=?,barcode=?,category=?,unit=?,cost=?,price=?,threshold=? WHERE id=? AND business_id=?",
        v.name,
        v.sku,
        v.barcode,
        v.category,
        v.unit,
        v.cost,
        v.price,
        v.threshold,
        req.params.id,
        u.business_id,
      );
      event(u, null, "Products", v.name, "Product details updated", v.sku);
    });
    res.json({ ok: true });
  });
  const variantSchema = z.object({
    name: text,
    sku: text,
    barcode: optional,
    cost: amount,
    price: amount,
    threshold: z.number().min(0).max(100000).refine(validQuantity),
  });
  app.post("/api/products/:id/variants", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const p = owned("products", req.params.id, u);
    const v = variantSchema
      .extend({ branch_id: uuid, stock: z.number().min(0).max(100000).refine(validQuantity) })
      .parse(req.body);
    branch(u, v.branch_id);
    if (
      get("SELECT id FROM products WHERE business_id=? AND sku=?", u.business_id, v.sku) ||
      get("SELECT id FROM product_variants WHERE business_id=? AND sku=?", u.business_id, v.sku)
    )
      fail("That SKU is already in use.", 409);
    const id = randomUUID();
    tx(() => {
      run(
        "INSERT INTO product_variants(id,business_id,product_id,name,sku,barcode,cost,price,threshold) VALUES(?,?,?,?,?,?,?,?,?)",
        id,
        u.business_id,
        p.id,
        v.name,
        v.sku,
        v.barcode,
        v.cost,
        v.price,
        v.threshold,
      );
      if (v.stock) movement(u, v.branch_id, p.id, v.stock, "Variant opening stock", id, id);
      event(u, v.branch_id, "Products", `${p.name} · ${v.name}`, "Variant created", v.sku, v.stock);
    });
    res.status(201).json({ id });
  });
  app.put("/api/products/:id/variants/:variantId", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const p = owned("products", req.params.id, u);
    const current = get(
      "SELECT * FROM product_variants WHERE id=? AND product_id=? AND business_id=? AND active=1",
      req.params.variantId,
      p.id,
      u.business_id,
    );
    if (!current) fail("Product variant not found.", 404);
    const v = variantSchema.parse(req.body);
    if (
      get("SELECT id FROM products WHERE business_id=? AND sku=? AND id<>?", u.business_id, v.sku, p.id) ||
      get("SELECT id FROM product_variants WHERE business_id=? AND sku=? AND id<>?", u.business_id, v.sku, current.id)
    )
      fail("That SKU is already in use.", 409);
    tx(() => {
      run(
        "UPDATE product_variants SET name=?,sku=?,barcode=?,cost=?,price=?,threshold=? WHERE id=?",
        v.name,
        v.sku,
        v.barcode,
        v.cost,
        v.price,
        v.threshold,
        current.id,
      );
      event(u, null, "Products", `${p.name} · ${v.name}`, "Variant details updated", v.sku);
    });
    res.json({ ok: true });
  });
  app.post("/api/products/:id/variants/:variantId/archive", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const p = owned("products", req.params.id, u);
    const variant = get(
      "SELECT * FROM product_variants WHERE id=? AND product_id=? AND business_id=? AND active=1",
      req.params.variantId,
      p.id,
      u.business_id,
    );
    if (!variant) fail("Product variant not found.", 404);
    const stockRows = all("SELECT quantity_milli FROM variant_stock WHERE variant_id=?", variant.id);
    if (stockRows.some((s) => s.quantity_milli > 0))
      fail("Move this variant's remaining stock before archiving it.", 409);
    run("UPDATE product_variants SET active=0 WHERE id=?", variant.id);
    event(u, null, "Products", `${p.name} · ${variant.name}`, "Variant archived", variant.sku);
    res.json({ ok: true });
  });
  app.post("/api/stock", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const v = z
      .object({
        product_id: uuid,
        variant_id: uuid.optional(),
        branch_id: uuid,
        delta: quantityDelta,
        reason: text,
        destination: uuid.optional(),
      })
      .parse(req.body);
    branch(u, v.branch_id);
    const p = owned("products", v.product_id, u);
    if (
      v.variant_id &&
      !get(
        "SELECT id FROM product_variants WHERE id=? AND product_id=? AND business_id=? AND active=1",
        v.variant_id,
        p.id,
        u.business_id,
      )
    )
      fail("Product variant not found.", 404);
    if (v.destination) {
      role(u, ["owner"]);
      branch(u, v.destination);
      if (v.destination === v.branch_id || v.delta >= 0)
        fail(
          "Choose a different destination and transfer a positive quantity.",
        );
    }
    tx(() => {
      const ref = randomUUID();
      movement(u, v.branch_id, p.id, v.delta, v.reason, ref, v.variant_id || null);
      if (v.destination)
        movement(u, v.destination, p.id, -v.delta, "Transfer received", ref, v.variant_id || null);
      event(u, v.branch_id, "Products", p.name, v.reason, ref, v.delta);
    });
    res.json({ ok: true });
  });
  app.post("/api/parties", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const v = z
      .object({
        kind: z.enum(["customer", "supplier"]),
        name: text,
        email: optional,
        phone: optional,
        address: optional,
      })
      .parse(req.body);
    const id = randomUUID();
    tx(() => {
      run(
        "INSERT INTO parties VALUES(?,?,?,?,?,?,?)",
        id,
        u.business_id,
        v.kind,
        v.name,
        v.email,
        v.phone,
        v.address,
      );
      event(
        u,
        null,
        v.kind === "customer" ? "Customers" : "Suppliers",
        v.name,
        "Contact created",
        id,
      );
    });
    res.status(201).json({ id });
  });
  app.post("/api/sales", (req, res) => {
    const u = req.user;
    const v = z
      .object({
        branch_id: uuid,
        customer_id: uuid.nullable(),
        items: z
          .array(
            z.object({
              product_id: uuid,
              variant_id: uuid.optional(),
              quantity,
            }),
          )
          .min(1)
          .max(200),
        expected_total: amount.optional(),
        discount: amount,
        tax_bps: z.number().int().min(0).max(10000),
        method: z.enum(["cash", "credit"]),
        tendered: amount,
        idempotency: uuid,
      })
      .parse(req.body);
    branch(u, v.branch_id);
    if (v.tax_bps && u.role === "cashier")
      fail("Tax overrides require a manager.", 403);
    if (v.discount && u.role === "cashier")
      fail("Discounts require a manager.", 403);
    const payload = hash(JSON.stringify(v));
    const prior = get(
      "SELECT * FROM sales WHERE business_id=? AND idempotency=?",
      u.business_id,
      v.idempotency,
    );
    if (prior) {
      if (prior.payload !== payload)
        fail("This checkout key was already used for another cart.", 409);
      return res.json({
        id: prior.id,
        reference: prior.reference,
        total: prior.total,
        change: Math.max(0, v.tendered - prior.total),
      });
    }
    if (
      new Set(v.items.map((i) => `${i.product_id}:${i.variant_id || ""}`)).size !==
      v.items.length
    )
      fail("Duplicate cart lines.");
    if (v.customer_id && owned("parties", v.customer_id, u).kind !== "customer")
      fail("Select a customer.");
    if (v.method === "credit" && (!v.customer_id || u.role === "cashier"))
      fail("Credit sales require a customer and manager authorization.", 403);
    const result = tx(() => {
      const activeShift = u.role === "cashier"
        ? get("SELECT id FROM cashier_shifts WHERE cashier_id=? AND branch_id=? AND closed_at IS NULL", u.id, v.branch_id)
        : null;
      if (u.role === "cashier" && !activeShift)
        fail("Open a cashier shift before completing a sale.", 409);
      const lines = v.items.map((i) => {
        const product = owned("products", i.product_id, u);
        const variant = i.variant_id
          ? get(
              "SELECT * FROM product_variants WHERE id=? AND product_id=? AND business_id=? AND active=1",
              i.variant_id,
              product.id,
              u.business_id,
            )
          : null;
        if (i.variant_id && !variant) fail("Product variant not found.", 404);
        return {
          ...product,
          ...(variant
            ? {
                name: `${product.name} · ${variant.name}`,
                sku: variant.sku,
                barcode: variant.barcode,
                cost: variant.cost,
                price: variant.price,
              }
            : {}),
          variant_id: variant?.id || null,
          quantity: i.quantity,
        };
      });
      if (lines.some((p) => !p.active)) fail("An item is unavailable.");
      const subtotal = lines.reduce(
        (s, p) => s + quantityAmount(p.price, quantityMilli(p.quantity)),
        0,
      );
      if (v.discount > subtotal) fail("Discount exceeds subtotal.");
      const tax = Number(
          (BigInt(subtotal - v.discount) * BigInt(v.tax_bps) + 5000n) / 10000n,
        ),
        total = subtotal - v.discount + tax;
      if (v.expected_total !== undefined && v.expected_total !== total)
        fail(
          "Prices changed. Refresh your workspace and review the cart before checking out.",
          409,
        );
      if (!Number.isSafeInteger(total) || total > 1_000_000_000)
        fail("Sale exceeds the supported amount.");
      if (v.method === "cash" && v.tendered < total)
        fail("Cash received is less than the sale total.");
      const id = randomUUID(),
        reference = "SS-" + id.slice(0, 8).toUpperCase();
      run(
        "INSERT INTO sales(id,business_id,branch_id,customer_id,reference,total,paid,discount,tax,method,created_at,actor_id,idempotency,payload,shift_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        id,
        u.business_id,
        v.branch_id,
        v.customer_id,
        reference,
        total,
        v.method === "cash" ? total : 0,
        v.discount,
        tax,
        v.method,
        now(),
        u.id,
        v.idempotency,
        payload,
        activeShift?.id || null,
      );
      for (const p of lines) {
        movement(u, v.branch_id, p.id, -p.quantity, "Sale", reference, p.variant_id);
        run(
          "INSERT INTO sale_items(id,sale_id,product_id,name,sku,quantity,price,cost,quantity_milli,variant_id) VALUES(?,?,?,?,?,?,?,?,?,?)",
          randomUUID(),
          id,
          p.id,
          p.name,
          p.sku,
          p.quantity,
          p.price,
          p.cost,
          quantityMilli(p.quantity),
          p.variant_id,
        );
      }
      event(
        u,
        v.branch_id,
        "Customers",
        v.customer_id
          ? owned("parties", v.customer_id, u).name
          : "Walk-in customer",
        `Sale · ${v.method}`,
        reference,
        total,
      );
      return {
        id,
        reference,
        total,
        change: v.method === "cash" ? v.tendered - total : 0,
      };
    });
    res.status(201).json(result);
  });
  app.post("/api/sales/:id/refund", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const sale = owned("sales", req.params.id, u);
    branch(u, sale.branch_id);
    tx(() => {
      if (sale.status !== "completed")
        fail("This sale is already refunded.", 409);
      for (const i of all("SELECT * FROM sale_items WHERE sale_id=?", sale.id))
        movement(
          u,
          sale.branch_id,
          i.product_id,
          i.quantity,
          "Full sale refund",
          sale.reference,
          i.variant_id,
        );
      run("UPDATE sales SET status='refunded' WHERE id=?", sale.id);
      event(
        u,
        sale.branch_id,
        "Customers",
        sale.reference,
        "Full sale refunded; cash refund recorded manually",
        sale.reference,
        -sale.paid,
      );
    });
    res.json({ ok: true });
  });
  app.post("/api/purchases", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const v = z
      .object({
        branch_id: uuid,
        supplier_id: uuid,
        product_id: uuid,
        variant_id: uuid.optional(),
        quantity,
        cost: amount,
      })
      .parse(req.body);
    branch(u, v.branch_id);
    if (owned("parties", v.supplier_id, u).kind !== "supplier")
      fail("Select a supplier.");
    const p = owned("products", v.product_id, u);
    const variant = v.variant_id
      ? get(
          "SELECT * FROM product_variants WHERE id=? AND product_id=? AND business_id=? AND active=1",
          v.variant_id,
          p.id,
          u.business_id,
        )
      : null;
    if (v.variant_id && !variant) fail("Product variant not found.", 404);
    const purchaseTotal = quantityAmount(v.cost, quantityMilli(v.quantity));
    if (purchaseTotal > 1_000_000_000)
      fail("Purchase exceeds the supported amount.");
    const id = randomUUID();
    tx(() => {
      run(
        "INSERT INTO purchases(id,business_id,branch_id,supplier_id,product_id,quantity,cost,total,reference,created_at,quantity_milli,variant_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        id,
        u.business_id,
        v.branch_id,
        v.supplier_id,
        p.id,
        v.quantity,
        v.cost,
        purchaseTotal,
        "PO-" + id.slice(0, 8).toUpperCase(),
        now(),
        quantityMilli(v.quantity),
        variant?.id || null,
      );
      event(
        u,
        v.branch_id,
        "Suppliers",
        p.name,
        "Purchase order created; awaiting goods",
        id,
        purchaseTotal,
      );
    });
    res.status(201).json({ id });
  });
  app.post("/api/purchases/:id/receive", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const p = owned("purchases", req.params.id, u);
    branch(u, p.branch_id);
    tx(() => {
      if (p.status !== "ordered")
        fail("This purchase is already received.", 409);
      movement(
        u,
        p.branch_id,
        p.product_id,
        p.quantity,
        "Goods received",
        p.reference,
        p.variant_id,
      );
      run("UPDATE purchases SET status='received' WHERE id=?", p.id);
      event(
        u,
        p.branch_id,
        "Suppliers",
        owned("parties", p.supplier_id, u).name,
        "Goods received; supplier payable created",
        p.reference,
        p.total,
      );
    });
    res.json({ ok: true });
  });
  app.post("/api/payments", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const v = z
      .object({
        kind: z.enum(["sales", "purchases"]),
        id: uuid,
        amount: amount.refine((v) => v > 0),
      })
      .parse(req.body);
    const p = owned(v.kind, v.id, u);
    branch(u, p.branch_id);
    tx(() => {
      if (
        (v.kind === "sales" && p.status !== "completed") ||
        (v.kind === "purchases" && p.status !== "received")
      )
        fail("This document is not payable.");
      if (v.amount > p.total - p.paid)
        fail("Payment exceeds the outstanding balance.");
      run(`UPDATE ${v.kind} SET paid=paid+? WHERE id=?`, v.amount, p.id);
      event(
        u,
        p.branch_id,
        v.kind === "sales" ? "Customers" : "Suppliers",
        p.reference,
        "Cash payment recorded",
        p.reference,
        v.amount,
      );
    });
    res.json({ ok: true });
  });
  app.post("/api/expenses", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const v = z
      .object({
        branch_id: uuid,
        name: text,
        category: text,
        amount: amount.refine((v) => v > 0),
        date: z.iso.date(),
      })
      .parse(req.body);
    branch(u, v.branch_id);
    const id = randomUUID();
    tx(() => {
      run(
        "INSERT INTO expenses VALUES(?,?,?,?,?,?,?,?)",
        id,
        u.business_id,
        v.branch_id,
        v.name,
        v.category,
        v.amount,
        v.date,
        now(),
      );
      event(u, v.branch_id, "Expenses", v.name, v.category, id, -v.amount);
    });
    res.status(201).json({ id });
  });
  app.get("/api/restaurant", (req, res) => {
    const u = req.user,
      branchId = String(req.query.branch || u.branch_id);
    role(u, ["owner", "manager"]);
    branch(u, branchId);
    const tables = all(
      "SELECT * FROM dining_tables WHERE business_id=? AND branch_id=? AND active=1 ORDER BY name",
      u.business_id,
      branchId,
    );
    const stations = all(
      "SELECT * FROM kitchen_stations WHERE business_id=? AND branch_id=? AND active=1 ORDER BY name",
      u.business_id,
      branchId,
    );
    const orders = all(
      "SELECT o.*,t.name table_name,u.name actor FROM restaurant_orders o JOIN dining_tables t ON t.id=o.table_id JOIN users u ON u.id=o.created_by WHERE o.business_id=? AND o.branch_id=? ORDER BY o.created_at DESC LIMIT 200",
      u.business_id,
      branchId,
    ).map((order) => ({
      ...order,
      items: all(
        "SELECT i.*,s.name station_name FROM restaurant_order_items i LEFT JOIN kitchen_stations s ON s.id=i.station_id WHERE i.order_id=? ORDER BY s.name,i.name",
        order.id,
      ),
    }));
    res.json({ tables, stations, orders });
  });
  app.post("/api/restaurant/tables", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const v = z
      .object({
        branch_id: uuid,
        name: text,
        seats: z.number().int().min(1).max(100),
      })
      .parse(req.body);
    branch(u, v.branch_id);
    const id = randomUUID();
    tx(() => {
      run(
        "INSERT INTO dining_tables(id,business_id,branch_id,name,seats) VALUES(?,?,?,?,?)",
        id,
        u.business_id,
        v.branch_id,
        v.name,
        v.seats,
      );
      event(u, v.branch_id, "Restaurant", v.name, "Dining table created", id);
    });
    res.status(201).json({ id });
  });
  app.post("/api/restaurant/stations", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const v = z
      .object({ branch_id: uuid, name: text })
      .parse(req.body);
    branch(u, v.branch_id);
    const id = randomUUID();
    tx(() => {
      run(
        "INSERT INTO kitchen_stations(id,business_id,branch_id,name) VALUES(?,?,?,?)",
        id,
        u.business_id,
        v.branch_id,
        v.name,
      );
      event(u, v.branch_id, "Restaurant", v.name, "Kitchen station created", id);
    });
    res.status(201).json({ id });
  });
  app.post("/api/restaurant/orders", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const v = z
      .object({
        branch_id: uuid,
        table_id: uuid,
        notes: optional,
        items: z
          .array(
            z.object({
              product_id: uuid,
              variant_id: uuid.optional(),
              station_id: uuid.nullable().optional(),
              quantity,
            }),
          )
          .min(1)
          .max(100),
      })
      .parse(req.body);
    branch(u, v.branch_id);
    const table = get(
      "SELECT * FROM dining_tables WHERE id=? AND business_id=? AND branch_id=? AND active=1",
      v.table_id,
      u.business_id,
      v.branch_id,
    );
    if (!table) fail("Dining table not found.", 404);
    const lines = v.items.map((item) => {
      const product = owned("products", item.product_id, u);
      const variant = item.variant_id
        ? get(
            "SELECT * FROM product_variants WHERE id=? AND product_id=? AND business_id=? AND active=1",
            item.variant_id,
            product.id,
            u.business_id,
          )
        : null;
      if (item.variant_id && !variant) fail("Product variant not found.", 404);
      const station = item.station_id
        ? get(
            "SELECT * FROM kitchen_stations WHERE id=? AND business_id=? AND branch_id=? AND active=1",
            item.station_id,
            u.business_id,
            v.branch_id,
          )
        : null;
      if (item.station_id && !station) fail("Kitchen station not found.", 404);
      return {
        ...item,
        product,
        variant,
        station,
        name: `${product.name}${variant ? ` · ${variant.name}` : ""}`,
        sku: variant?.sku || product.sku,
        price: variant?.price ?? product.price,
        cost: variant?.cost ?? product.cost,
      };
    });
    const id = randomUUID(),
      reference = "RO-" + id.slice(0, 8).toUpperCase(),
    timestamp = now();
    tx(() => {
      if (
        get(
          "SELECT id FROM restaurant_orders WHERE table_id=? AND status IN ('open','submitted','preparing','ready','served')",
          table.id,
        )
      )
        fail("This table already has an active order.", 409);
      run(
        "INSERT INTO restaurant_orders(id,business_id,branch_id,table_id,reference,status,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'open',?,?,?,?)",
        id,
        u.business_id,
        v.branch_id,
        table.id,
        reference,
        v.notes,
        u.id,
        timestamp,
        timestamp,
      );
      for (const line of lines)
        run(
          "INSERT INTO restaurant_order_items(id,order_id,product_id,variant_id,station_id,name,sku,quantity,quantity_milli,price,cost,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,'queued')",
          randomUUID(),
          id,
          line.product.id,
          line.variant?.id || null,
          line.station?.id || null,
          line.name,
          line.sku,
          line.quantity,
          quantityMilli(line.quantity),
          line.price,
          line.cost,
        );
      event(u, v.branch_id, "Restaurant", table.name, "Table order opened", reference);
    });
    res.status(201).json({ id, reference });
  });
  app.post("/api/restaurant/orders/:id/submit", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const order = get(
      "SELECT * FROM restaurant_orders WHERE id=? AND business_id=?",
      req.params.id,
      u.business_id,
    );
    if (!order) fail("Restaurant order not found.", 404);
    branch(u, order.branch_id);
    tx(() => {
      const current = get(
        "SELECT * FROM restaurant_orders WHERE id=? AND business_id=?",
        order.id,
        u.business_id,
      );
      if (!current || current.status !== "open")
        fail("This order is no longer open.", 409);
      const lines = all(
        "SELECT * FROM restaurant_order_items WHERE order_id=?",
        order.id,
      );
      for (const line of lines)
        movement(
          u,
          order.branch_id,
          line.product_id,
          -line.quantity,
          "Restaurant order",
          order.reference,
          line.variant_id,
        );
      run(
        "UPDATE restaurant_orders SET status='submitted',updated_at=? WHERE id=?",
        now(),
        order.id,
      );
      event(u, order.branch_id, "Restaurant", order.reference, "Order sent to kitchen; stock deducted", order.reference);
    });
    res.json({ ok: true });
  });
  app.post("/api/restaurant/orders/:id/items/:itemId/status", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const v = z
      .object({ status: z.enum(["preparing", "ready", "served"]) })
      .parse(req.body);
    const order = get(
      "SELECT * FROM restaurant_orders WHERE id=? AND business_id=?",
      req.params.id,
      u.business_id,
    );
    if (!order) fail("Restaurant order not found.", 404);
    branch(u, order.branch_id);
    tx(() => {
      const item = get(
        "SELECT * FROM restaurant_order_items WHERE id=? AND order_id=?",
        req.params.itemId,
        order.id,
      );
      if (!item) fail("Order item not found.", 404);
      const allowed = {
        queued: "preparing",
        preparing: "ready",
        ready: "served",
      };
      if (allowed[item.status] !== v.status)
        fail("Order item status must advance one step at a time.", 409);
      run(
        "UPDATE restaurant_order_items SET status=? WHERE id=? AND status=?",
        v.status,
        item.id,
        item.status,
      );
      const statuses = all(
        "SELECT status FROM restaurant_order_items WHERE order_id=?",
        order.id,
      ).map((row) => row.status);
      const orderStatus =
        statuses.every((status) => status === "served")
          ? "served"
          : statuses.every((status) => ["ready", "served"].includes(status))
            ? "ready"
            : "preparing";
      run(
        "UPDATE restaurant_orders SET status=?,updated_at=? WHERE id=?",
        orderStatus,
        now(),
        order.id,
      );
      event(u, order.branch_id, "Restaurant", item.name, `Kitchen item marked ${v.status}`, order.reference);
    });
    res.json({ ok: true });
  });
  app.post("/api/restaurant/orders/:id/close", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const order = get(
      "SELECT * FROM restaurant_orders WHERE id=? AND business_id=?",
      req.params.id,
      u.business_id,
    );
    if (!order) fail("Restaurant order not found.", 404);
    branch(u, order.branch_id);
    tx(() => {
      const current = get(
        "SELECT status FROM restaurant_orders WHERE id=? AND business_id=?",
        order.id,
        u.business_id,
      );
      if (!current || current.status !== "served")
        fail("All order items must be served before closing.", 409);
      run(
        "UPDATE restaurant_orders SET status='closed',updated_at=? WHERE id=?",
        now(),
        order.id,
      );
      event(u, order.branch_id, "Restaurant", order.reference, "Table order closed; payment is recorded separately in POS", order.reference);
    });
    res.json({ ok: true });
  });
  app.post("/api/restaurant/orders/:id/cancel", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const order = get(
      "SELECT * FROM restaurant_orders WHERE id=? AND business_id=?",
      req.params.id,
      u.business_id,
    );
    if (!order) fail("Restaurant order not found.", 404);
    branch(u, order.branch_id);
    tx(() => {
      const current = get(
        "SELECT status FROM restaurant_orders WHERE id=? AND business_id=?",
        order.id,
        u.business_id,
      );
      if (!current || current.status !== "open")
        fail("Only an unsent order can be cancelled.", 409);
      run(
        "UPDATE restaurant_order_items SET status='cancelled' WHERE order_id=?",
        order.id,
      );
      run(
        "UPDATE restaurant_orders SET status='cancelled',updated_at=? WHERE id=?",
        now(),
        order.id,
      );
      event(u, order.branch_id, "Restaurant", order.reference, "Unsent table order cancelled", order.reference);
    });
    res.json({ ok: true });
  });
  app.post("/api/branches", (req, res) => {
    const u = req.user;
    role(u, ["owner"]);
    const v = z
        .object({ name: text, address: optional, phone: optional })
        .parse(req.body),
      id = randomUUID();
    tx(() => {
      run(
        "INSERT INTO branches(id,business_id,name,address,phone) VALUES(?,?,?,?,?)",
        id,
        u.business_id,
        v.name,
        v.address,
        v.phone,
      );
      event(u, id, "Business", v.name, "Branch created", id);
    });
    res.status(201).json({ id });
  });
  app.put("/api/branches/:id", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const v = z
      .object({ name: text, address: optional, phone: optional })
      .parse(req.body);
    const target = get(
      "SELECT * FROM branches WHERE id=? AND business_id=? AND active=1",
      req.params.id,
      u.business_id,
    );
    if (!target) fail("Branch not found.", 404);
    tx(() => {
      run(
        "UPDATE branches SET name=?,address=?,phone=? WHERE id=? AND business_id=?",
        v.name,
        v.address,
        v.phone,
        target.id,
        u.business_id,
      );
      event(u, target.id, "Business", v.name, "Branch details updated", target.id);
    });
    res.json({ ok: true });
  });
  app.post("/api/staff", (req, res) => {
    const u = req.user;
    if (!canManageStaff(u))
      fail("Your role does not permit this action.", 403);
    const v = z
      .object({
        name: text,
        email,
        password: z.string().min(10).max(200),
        role: z.enum(["manager", "cashier"]),
        branch_id: uuid,
        account_status: z.enum(["active", "suspended", "pending"]).default("active"),
        expires_at: z.string().optional().default(""),
      })
      .parse(req.body);
    branch(u, v.branch_id);
    const id = randomUUID();
    const expiresAt = v.expires_at && v.expires_at.trim() ? v.expires_at : null;
    tx(() => {
      run(
        "INSERT INTO users(id,business_id,branch_id,name,email,password,role,active,account_status,expires_at,is_admin,theme) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        id,
        u.business_id,
        v.branch_id,
        v.name,
        v.email,
        passwordHash(v.password),
        v.role,
        v.account_status === "active" ? 1 : 0,
        v.account_status,
        expiresAt,
        0,
        "dark",
      );
      event(u, v.branch_id, "Staff", v.name, "Staff account created", id);
    });
    res.status(201).json({ id });
  });
  app.put("/api/staff/:id", (req, res) => {
    const u = req.user;
    if (!canManageStaff(u))
      fail("Your role does not permit this action.", 403);
    const v = z
      .object({
        name: text,
        role: z.enum(["manager", "cashier"]),
        branch_id: uuid,
        account_status: z.enum(["active", "suspended", "pending"]).default("active"),
        expires_at: z.string().optional().default(""),
      })
      .parse(req.body);
    const member = owned("users", req.params.id, u);
    if (member.role === "owner")
      fail("Owner accounts cannot be edited here.", 403);
    branch(u, v.branch_id);
    const expiresAt = v.expires_at && v.expires_at.trim() ? v.expires_at : null;
    tx(() => {
      run(
        "UPDATE users SET name=?,role=?,branch_id=?,active=?,account_status=?,expires_at=? WHERE id=? AND business_id=?",
        v.name,
        v.role,
        v.branch_id,
        v.account_status === "active" ? 1 : 0,
        v.account_status,
        expiresAt,
        member.id,
        u.business_id,
      );
      run("DELETE FROM sessions WHERE user_id=?", member.id);
      event(
        u,
        v.branch_id,
        "Staff",
        v.name,
        `Staff details updated; role ${member.role} → ${v.role}; access status ${member.account_status || "active"} → ${v.account_status}; sessions revoked`,
        member.id,
      );
    });
    res.json({ ok: true });
  });
  app.delete("/api/staff/:id", (req, res) => {
    const u = req.user;
    if (!canManageStaff(u))
      fail("Your role does not permit this action.", 403);
    const member = owned("users", req.params.id, u);
    if (member.role === "owner")
      fail("Owner accounts cannot be deleted here.", 403);
    tx(() => {
      run("DELETE FROM sessions WHERE user_id=?", member.id);
      run("DELETE FROM users WHERE id=? AND business_id=?", member.id, u.business_id);
      event(
        u,
        member.branch_id,
        "Staff",
        member.name,
        "Staff account deleted from the business dashboard",
        member.id,
      );
    });
    res.json({ ok: true, deleted: member.email });
  });
  app.post("/api/staff/:id/toggle", (req, res) => {
    const u = req.user;
    if (!canManageStaff(u))
      fail("Your role does not permit this action.", 403);
    const member = owned("users", req.params.id, u);
    if (member.role === "owner")
      fail("Owner accounts cannot be disabled here.");
    const nextStatus = member.account_status === "active" ? "suspended" : "active";
    tx(() => {
      run(
        "UPDATE users SET active=?,account_status=? WHERE id=?",
        nextStatus === "active" ? 1 : 0,
        nextStatus,
        member.id,
      );
      run("DELETE FROM sessions WHERE user_id=?", member.id);
      event(
        u,
        member.branch_id,
        "Staff",
        member.name,
        nextStatus === "active"
          ? "Account enabled"
          : "Account disabled; sessions revoked",
        member.id,
      );
    });
    res.json({ ok: true });
  });
  app.put("/api/business", (req, res) => {
    const u = req.user;
    role(u, ["owner"]);
    const v = z
      .object({
        name: text,
        currency,
        country: text,
        timezone: text,
        email: optional,
        phone: optional,
        address: optional,
        tax_id: optional,
        category: z.enum(businessCategories).default("Retail"),
        custom_category: optional,
      })
      .parse(req.body);
    if (v.category === "Other" && !v.custom_category)
      fail("Enter your business category.");
    try {
      new Intl.DateTimeFormat("en", { timeZone: v.timezone });
    } catch {
      fail("Invalid timezone.");
    }
    tx(() => {
      run(
        "UPDATE businesses SET name=?,currency=?,country=?,timezone=?,email=?,phone=?,address=?,tax_id=?,category=?,custom_category=? WHERE id=?",
        v.name,
        v.currency,
        v.country,
        v.timezone,
        v.email,
        v.phone,
        v.address,
        v.tax_id,
        v.category,
        v.category === "Other" ? v.custom_category : "",
        u.business_id,
      );
      event(
        u,
        null,
        "Business",
        v.name,
        "Business settings updated",
        u.business_id,
      );
    });
    res.json({ ok: true });
  });
  app.put("/api/profile", (req, res) => {
    const v = z
      .object({ name: text, theme: z.enum(["dark", "light"]) })
      .parse(req.body);
    run(
      "UPDATE users SET name=?,theme=? WHERE id=?",
      v.name,
      v.theme,
      req.user.id,
    );
    res.json({ ok: true });
  });
  app.post("/api/password", (req, res) => {
    const v = z
      .object({
        current: z.string().max(200),
        password: z.string().min(10).max(200),
      })
      .parse(req.body);
    if (!passwordCheck(v.current, req.user.password))
      fail("Current password is incorrect.", 403);
    tx(() => {
      run(
        "UPDATE users SET password=? WHERE id=?",
        passwordHash(v.password),
        req.user.id,
      );
      run("DELETE FROM sessions WHERE user_id=?", req.user.id);
    });
    session(res, req.user.id);
    res.json({ ok: true });
  });
  app.post("/api/exports", (req, res) => {
    const u = req.user;
    role(u, ["owner", "manager"]);
    const v = z
      .object({
        branch_id: uuid,
        kind: z.enum(["inventory", "sales", "transactions", "expenses"]),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        low: z.boolean().optional(),
      })
      .parse(req.body);
    branch(u, v.branch_id);
    const rows =
      v.kind === "inventory"
        ? all(
            `SELECT p.name,p.sku,p.category,p.unit,p.cost,p.price,COALESCE(s.quantity,0) stock,p.threshold FROM products p LEFT JOIN stock s ON s.product_id=p.id AND s.branch_id=? WHERE p.business_id=? AND p.active=1 ${v.low ? "AND COALESCE(s.quantity,0)<=p.threshold" : ""}`,
            v.branch_id,
            u.business_id,
          )
        : all(
            `SELECT * FROM ${v.kind === "transactions" ? "events" : v.kind} WHERE business_id=? AND branch_id=?`,
            u.business_id,
            v.branch_id,
          ).filter((r) => {
            const d =
              r.date ||
              new Intl.DateTimeFormat("en-CA", {
                timeZone: owned("businesses", u.business_id, u).timezone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date(r.created_at));
            return (!v.from || d >= v.from) && (!v.to || d <= v.to);
          });
    const esc = (v) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+\-@\t\r]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const columns = rows.length
      ? Object.keys(rows[0])
      : ["No records in selected scope"];
    const content =
      "\uFEFF" +
      [
        columns.map(esc).join(","),
        ...rows.map((r) => columns.map((c) => esc(r[c])).join(",")),
      ].join("\r\n");
    const id = randomUUID(),
      name = `smartsell-${v.kind}-${now().slice(0, 10)}.csv`;
    run(
      "INSERT INTO exports VALUES(?,?,?,?,?,?,?)",
      id,
      u.business_id,
      v.branch_id,
      name,
      `${v.kind}${v.low ? " · low stock only" : ""} · ${v.from || "all dates"} to ${v.to || "present"} · monetary columns in minor units`,
      content,
      now(),
    );
    res.status(201).json({ id, name, url: "/api/exports/" + id });
  });
  app.get("/api/exports/:id", (req, res) => {
    role(req.user, ["owner", "manager"]);
    const e = owned("exports", req.params.id, req.user);
    branch(req.user, e.branch_id);
    res
      .set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${e.name}"`,
      })
      .send(e.content);
  });
  if (serveStatic) {
    app.use(express.static("dist"));
    app.get("/{*path}", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile("index.html", { root: "dist" });
    });
  }
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: err.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    if (err.code?.includes("SQLITE_CONSTRAINT") || (err.errcode & 255) === 19)
      return res.status(409).json({
        error:
          "A record with this email or SKU already exists, or this operation violates a data constraint.",
      });
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "An unexpected server error occurred." });
  });
  return { app, db };
}

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
const { app, db } = createApp({ dbPath: ":memory:", serveStatic: false });
let server, base;
before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  db.close();
});
function client() {
  let cookie = "";
  return async (path, body, method = body ? "POST" : "GET") => {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        cookie,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    const json = await r.json();
    return { status: r.status, ...json };
  };
}
const register = (email) => ({
  name: "Test Owner",
  business: "Test Retail",
  email,
  password: "CorrectHorse123!",
  currency: "KES",
  country: "Kenya",
  timezone: "Africa/Nairobi",
  branch: "Main",
});
const product = (branch, sku = "TEA-001") => ({
  branch_id: branch,
  name: "Tea",
  sku,
  category: "Groceries",
  unit: "pack",
  cost: 8000,
  price: 12000,
  threshold: 2,
  stock: 10,
});
test("real retail workflows reconcile; retries, permissions and tenant boundaries are enforced", async () => {
  const a = client(),
    b = client(),
    cashier = client();
  assert.equal(
    (await a("/auth/register", register("a@example.com"))).status,
    201,
  );
  assert.equal(
    (await b("/auth/register", register("b@example.com"))).status,
    201,
  );
  let wa = await a("/workspace"),
    wb = await b("/workspace");
  const branch = wa.user.branch_id;
  assert.equal(wa.products.length, 0);
  assert.equal(wa.sales.length, 0);
  assert.equal(wa.branches.length, 1);
  const p = await a("/products", product(branch));
  assert.equal(p.status, 201);
  assert.equal(
    (
      await b(
        "/products/" + p.id,
        { ...product(wb.user.branch_id), name: "Hacked" },
        "PUT",
      )
    ).status,
    404,
  );
  assert.equal((await b("/workspace?branch=" + branch)).status, 403);
  const customer = await a("/parties", {
      kind: "customer",
      name: "Customer One",
    }),
    supplier = await a("/parties", { kind: "supplier", name: "Supplier One" });
  const sale = {
    branch_id: branch,
    customer_id: null,
    items: [{ product_id: p.id, quantity: 2 }],
    discount: 1000,
    tax_bps: 1600,
    method: "cash",
    tendered: 30000,
    idempotency: crypto.randomUUID(),
  };
  const checkout = await a("/sales", sale);
  assert.equal(checkout.status, 201);
  assert.equal(checkout.total, 26680);
  assert.equal(checkout.change, 3320);
  const retry = await a("/sales", sale);
  assert.equal(retry.id, checkout.id);
  assert.equal(
    (await a("/sales", { ...sale, items: [{ product_id: p.id, quantity: 1 }] }))
      .status,
    409,
  );
  wa = await a("/workspace");
  assert.equal(wa.sales.length, 1);
  assert.equal(wa.products[0].stock, 8);
  assert.equal(wa.items[0].cost, 8000);
  const failed = await a("/sales", {
    ...sale,
    items: [{ product_id: p.id, quantity: 99 }],
    tendered: 2000000,
    idempotency: crypto.randomUUID(),
  });
  assert.equal(failed.status, 409);
  wa = await a("/workspace");
  assert.equal(wa.sales.length, 1);
  assert.equal(wa.products[0].stock, 8);
  const order = await a("/purchases", {
    branch_id: branch,
    supplier_id: supplier.id,
    product_id: p.id,
    quantity: 5,
    cost: 8000,
  });
  assert.equal(order.status, 201);
  wa = await a("/workspace");
  assert.equal(wa.products[0].stock, 8);
  assert.equal(wa.purchases[0].status, "ordered");
  assert.equal(
    (await a("/purchases/" + order.id + "/receive", {})).status,
    200,
  );
  assert.equal(
    (await a("/purchases/" + order.id + "/receive", {})).status,
    409,
  );
  wa = await a("/workspace");
  assert.equal(wa.products[0].stock, 13);
  assert.equal(wa.purchases[0].total - wa.purchases[0].paid, 40000);
  await a("/payments", { kind: "purchases", id: order.id, amount: 15000 });
  wa = await a("/workspace");
  assert.equal(wa.purchases[0].total - wa.purchases[0].paid, 25000);
  const credit = await a("/sales", {
    ...sale,
    customer_id: customer.id,
    items: [{ product_id: p.id, quantity: 1 }],
    discount: 0,
    tax_bps: 0,
    method: "credit",
    tendered: 0,
    idempotency: crypto.randomUUID(),
  });
  assert.equal(credit.total, 12000);
  await a("/payments", { kind: "sales", id: credit.id, amount: 4000 });
  wa = await a("/workspace");
  const cs = wa.sales.find((s) => s.id === credit.id);
  assert.equal(cs.total - cs.paid, 8000);
  assert.equal(
    (await a("/payments", { kind: "sales", id: credit.id, amount: 9000 }))
      .status,
    400,
  );
  assert.equal(
    (
      await a("/expenses", {
        branch_id: branch,
        name: "Transport",
        category: "Transport",
        amount: 500,
        date: "2026-10-30",
      })
    ).status,
    201,
  );
  const second = await a("/branches", { name: "Second branch" });
  assert.equal(second.status, 201);
  await a("/stock", {
    branch_id: branch,
    product_id: p.id,
    delta: -3,
    reason: "Branch transfer",
    destination: second.id,
  });
  wa = await a("/workspace");
  const w2 = await a("/workspace?branch=" + second.id);
  assert.equal(wa.products[0].stock, 9);
  assert.equal(w2.products[0].stock, 3);
  assert.equal(
    (
      await a("/stock", {
        branch_id: branch,
        product_id: p.id,
        delta: -100,
        reason: "Bad count",
      })
    ).status,
    409,
  );
  const staff = await a("/staff", {
    name: "Cashier",
    email: "cashier@example.com",
    password: "CashierPass123!",
    role: "cashier",
    branch_id: branch,
  });
  assert.equal(staff.status, 201);
  await cashier("/auth/login", {
    email: "cashier@example.com",
    password: "CashierPass123!",
  });
  assert.equal(
    (await cashier("/products", product(branch, "DENIED"))).status,
    403,
  );
  assert.equal((await cashier("/workspace?branch=" + second.id)).status, 403);
  assert.equal(
    (await cashier("/business", { name: "Wrong" }, "PUT")).status,
    403,
  );
  const cw = await cashier("/workspace");
  assert.equal(cw.staff.length, 0);
  assert.equal(cw.events.length, 0);
  assert.equal(cw.products[0].cost, 0);
  assert.equal(cw.sales.length, 0);
  const saleWithoutShift = await cashier("/sales", {
    ...sale,
    discount: 0,
    tax_bps: 0,
    idempotency: crypto.randomUUID(),
  });
  assert.equal(saleWithoutShift.status, 409);
  const openedShift = await cashier("/cashier-shifts", {
    action: "open",
    opening_cash: 10000,
  });
  assert.equal(openedShift.status, 201);
  const cashSale = await cashier("/sales", {
    ...sale,
    discount: 0,
    tax_bps: 0,
    idempotency: crypto.randomUUID(),
  });
  assert.equal(cashSale.status, 201);
  const closedShift = await cashier("/cashier-shifts", {
    action: "close",
    counted_cash: 10000 + cashSale.total,
  });
  assert.equal(closedShift.status, 200);
  assert.equal(closedShift.shift.expected_cash, 10000 + cashSale.total);
  assert.equal(closedShift.shift.variance, 0);
  assert.equal(closedShift.shift.sales_count, 1);
  assert.equal(closedShift.shift.report.items[0].name, "Tea");
  assert.equal(closedShift.shift.report.items[0].quantity, 2);
  const eodReports = await a(`/cashier-shifts?branch=${branch}`);
  assert.equal(eodReports.shifts.length, 1);
  assert.equal(eodReports.shifts[0].cashier, "Cashier");
  assert.equal(eodReports.shifts[0].report.sales.length, 1);
  assert.equal((await cashier(`/cashier-shifts?branch=${branch}`)).status, 403);
  assert.equal(
    (await cashier("/sales/" + cashSale.id + "/refund", {})).status,
    403,
  );
  await a("/staff/" + staff.id + "/toggle", {});
  assert.equal((await cashier("/workspace")).status, 401);
  const exported = await a("/exports", {
    branch_id: branch,
    kind: "inventory",
  });
  assert.equal(exported.status, 201);
  const denied = await b("/exports/" + exported.id);
  assert.equal(denied.status, 404);
  await a("/sales/" + checkout.id + "/refund", {});
  assert.equal((await a("/sales/" + checkout.id + "/refund", {})).status, 409);
  wa = await a("/workspace");
  const movementTotal = wa.movements
    .filter((m) => m.product_id === p.id)
    .reduce((n, m) => n + m.delta, 0);
  assert.equal(movementTotal, wa.products[0].stock);
  assert.equal(wa.sales.find((s) => s.id === checkout.id).status, "refunded");
  assert.equal(
    (await a("/business", { ...wa.business, currency: "JPY" }, "PUT")).status,
    200,
  );
  wa = await a("/workspace");
  assert.equal(wa.business.currency, "JPY");
  wb = await b("/workspace");
  assert.equal(wb.products.length, 0);
  assert.equal(wb.sales.length, 0);
  assert.equal(wb.events.length, 0);
});
test("new businesses default to Tanzanian shillings when no currency is selected", async () => {
  const c = client();
  const details = register("tzs-default@example.com");
  delete details.currency;
  assert.equal((await c("/auth/register", details)).status, 201);
  const workspace = await c("/workspace");
  assert.equal(workspace.business.currency, "TZS");
});
test("CSV batch is all-or-nothing and duplicate SKU errors are controlled", async () => {
  const c = client();
  await c("/auth/register", register("csv@example.com"));
  const w = await c("/workspace"),
    br = w.user.branch_id;
  const first = product(br, "SAME");
  delete first.branch_id;
  const imported = await c("/products/import", {
    branch_id: br,
    products: [first, { ...first, name: "Duplicate" }],
  });
  assert.equal(imported.status, 409);
  assert.equal((await c("/workspace")).products.length, 0);
  assert.equal(
    (
      await c("/products/import", {
        branch_id: br,
        products: [first, { ...first, sku: "OTHER" }],
      })
    ).status,
    201,
  );
  assert.equal((await c("/workspace")).products.length, 2);
});
test("request origins and anonymous access are rejected", async () => {
  assert.equal((await client()("/workspace")).status, 401);
  const r = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(r.status, 403);
});
test("simultaneous checkouts cannot oversell and stale totals fail before commit", async () => {
  const c = client();
  await c("/auth/register", register("race@example.com"));
  const w = await c("/workspace"),
    branch = w.user.branch_id;
  const p = await c("/products", { ...product(branch, "LAST-ONE"), stock: 1 });
  const sale = {
    branch_id: branch,
    customer_id: null,
    items: [{ product_id: p.id, quantity: 1 }],
    discount: 0,
    tax_bps: 0,
    method: "cash",
    tendered: 12000,
    expected_total: 12000,
  };
  assert.equal(
    (
      await c("/sales", {
        ...sale,
        expected_total: 10000,
        idempotency: crypto.randomUUID(),
      })
    ).status,
    409,
  );
  assert.equal((await c("/workspace")).products[0].stock, 1);
  const results = await Promise.all([
    c("/sales", { ...sale, idempotency: crypto.randomUUID() }),
    c("/sales", { ...sale, idempotency: crypto.randomUUID() }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const final = await c("/workspace");
  assert.equal(final.products[0].stock, 0);
  assert.equal(final.sales.length, 1);
});
test("password changes revoke other sessions and saved records survive logout", async () => {
  const a = client(),
    other = client();
  await a("/auth/register", register("security@example.com"));
  await other("/auth/login", {
    email: "security@example.com",
    password: "CorrectHorse123!",
  });
  assert.equal(
    (await a("/password", { current: "wrong", password: "UpdatedHorse123!" }))
      .status,
    403,
  );
  assert.equal(
    (
      await a("/password", {
        current: "CorrectHorse123!",
        password: "UpdatedHorse123!",
      })
    ).status,
    200,
  );
  assert.equal((await other("/workspace")).status, 401);
  assert.equal((await a("/workspace")).status, 200);
  await a("/auth/logout", {});
  assert.equal((await a("/workspace")).status, 401);
  assert.equal(
    (
      await a("/auth/login", {
        email: "security@example.com",
        password: "UpdatedHorse123!",
      })
    ).status,
    200,
  );
  assert.equal((await a("/workspace")).branches.length, 1);
});
test("business categories, manager branch editing, variants and fractional stock reconcile", async () => {
  const missingCustomCategory = client();
  assert.equal(
    (
      await missingCustomCategory("/auth/register", {
        ...register("missing-category@example.com"),
        category: "Other",
      })
    ).status,
    400,
  );
  const owner = client();
  await owner("/auth/register", {
    ...register("features@example.com"),
    category: "Other",
    custom_category: "Artisan bakery",
  });
  let w = await owner("/workspace");
  const main = w.branches.find((b) => b.is_default);
  assert.equal(w.business.category, "Other");
  assert.equal(w.business.custom_category, "Artisan bakery");
  assert.ok(main);
  const second = await owner("/branches", {
    name: "West Branch",
    address: "West Road",
    phone: "555",
  });
  assert.equal(second.status, 201);
  const manager = await owner("/staff", {
    name: "Branch Admin",
    email: "branch-admin@example.com",
    password: "ManagerPassword123!",
    role: "manager",
    branch_id: main.id,
  });
  assert.equal(manager.status, 201);
  const managerClient = client();
  await managerClient("/auth/login", {
    email: "branch-admin@example.com",
    password: "ManagerPassword123!",
  });
  assert.equal(
    (
      await managerClient(
        `/branches/${second.id}`,
        { name: "West Main", address: "New Road", phone: "556" },
        "PUT",
      )
    ).status,
    200,
  );
  const otherBusiness = client();
  await otherBusiness("/auth/register", register("other-branch-owner@example.com"));
  assert.equal(
    (
      await otherBusiness(
        `/branches/${second.id}`,
        { name: "Cross-tenant", address: "", phone: "" },
        "PUT",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await managerClient(
        `/branches/${main.id}`,
        { name: "Main Market", address: "Central", phone: "557" },
        "PUT",
      )
    ).status,
    200,
  );
  const created = await owner("/products", {
    ...product(main.id, "FLOUR"),
    stock: 1.501,
    threshold: 0.25,
  });
  assert.equal(created.status, 201);
  const variant = await owner(`/products/${created.id}/variants`, {
    branch_id: main.id,
    name: "Large bag",
    sku: "FLOUR-L",
    barcode: "QR-FLOUR-L",
    cost: 9000,
    price: 15000,
    threshold: 0.5,
    stock: 2.25,
  });
  assert.equal(variant.status, 201);
  let workspace = await owner("/workspace");
  const flour = workspace.products.find((p) => p.id === created.id);
  assert.equal(flour.stock, 1.501);
  assert.equal(flour.variants[0].stock, 2.25);
  assert.equal(
    (
      await owner(`/products/${created.id}/variants/${variant.id}`, {
        name: "Family bag",
        sku: "FLOUR-L",
        barcode: "QR-FLOUR-L",
        cost: 9000,
        price: 15000,
        threshold: 0.5,
      }, "PUT")
    ).status,
    200,
  );
  const sale = await owner("/sales", {
    branch_id: main.id,
    customer_id: null,
    items: [
      { product_id: created.id, quantity: 0.001 },
      { product_id: created.id, variant_id: variant.id, quantity: 0.5 },
    ],
    discount: 0,
    tax_bps: 0,
    method: "cash",
    tendered: 7512,
    idempotency: crypto.randomUUID(),
  });
  assert.equal(sale.status, 201);
  assert.equal(sale.total, 7512);
  workspace = await owner("/workspace");
  const afterSale = workspace.products.find((p) => p.id === created.id);
  assert.equal(afterSale.stock, 1.5);
  assert.equal(afterSale.variants[0].stock, 1.75);
  const supplier = await owner("/parties", {
    kind: "supplier",
    name: "Flour supplier",
  });
  const purchase = await owner("/purchases", {
    branch_id: main.id,
    supplier_id: supplier.id,
    product_id: created.id,
    variant_id: variant.id,
    quantity: 0.5,
    cost: 9000,
  });
  assert.equal(purchase.status, 201);
  assert.equal((await owner(`/purchases/${purchase.id}/receive`, {})).status, 200);
  workspace = await owner("/workspace");
  assert.equal(
    workspace.products.find((p) => p.id === created.id).variants[0].stock,
    2.25,
  );
});
test("restaurant orders route tickets through kitchen statuses and deduct stock on submission", async () => {
  const c = client();
  await c("/auth/register", register("restaurant@example.com"));
  const w = await c("/workspace"),
    branch = w.user.branch_id;
  const p = await c("/products", { ...product(branch, "SOUP"), stock: 5 });
  const table = await c("/restaurant/tables", {
    branch_id: branch,
    name: "Table 1",
    seats: 4,
  });
  const station = await c("/restaurant/stations", {
    branch_id: branch,
    name: "Hot kitchen",
  });
  assert.equal(table.status, 201);
  assert.equal(station.status, 201);
  const order = await c("/restaurant/orders", {
    branch_id: branch,
    table_id: table.id,
    notes: "No onions",
    items: [
      {
        product_id: p.id,
        station_id: station.id,
        quantity: 1.25,
      },
    ],
  });
  assert.equal(order.status, 201);
  assert.equal(
    (
      await c("/restaurant/orders", {
        branch_id: branch,
        table_id: table.id,
        items: [{ product_id: p.id, quantity: 1 }],
      })
    ).status,
    409,
  );
  assert.equal((await c("/workspace")).products[0].stock, 5);
  let restaurant = await c(`/restaurant?branch=${branch}`);
  assert.equal(restaurant.orders[0].status, "open");
  assert.equal(restaurant.orders[0].items[0].station_name, "Hot kitchen");
  assert.equal(
    (await c(`/restaurant/orders/${order.id}/submit`, {})).status,
    200,
  );
  assert.equal((await c("/workspace")).products[0].stock, 3.75);
  restaurant = await c(`/restaurant?branch=${branch}`);
  const itemId = restaurant.orders[0].items[0].id;
  for (const status of ["preparing", "ready", "served"])
    assert.equal(
      (
        await c(
          `/restaurant/orders/${order.id}/items/${itemId}/status`,
          { status },
        )
      ).status,
      200,
    );
  restaurant = await c(`/restaurant?branch=${branch}`);
  assert.equal(restaurant.orders[0].status, "served");
  assert.equal((await c(`/restaurant/orders/${order.id}/close`, {})).status, 200);
  restaurant = await c(`/restaurant?branch=${branch}`);
  assert.equal(restaurant.orders[0].status, "closed");
});
test("schema v1 databases upgrade without losing business or main-branch data", () => {
  const dbPath = join(tmpdir(), `smartsell-migration-${crypto.randomUUID()}.db`);
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE businesses(
      id TEXT PRIMARY KEY,name TEXT NOT NULL,currency TEXT NOT NULL,
      country TEXT NOT NULL,timezone TEXT NOT NULL,email TEXT DEFAULT '',
      phone TEXT DEFAULT '',address TEXT DEFAULT '',tax_id TEXT DEFAULT ''
    );
    CREATE TABLE branches(
      id TEXT PRIMARY KEY,business_id TEXT NOT NULL,name TEXT NOT NULL,
      address TEXT DEFAULT '',phone TEXT DEFAULT '',active INTEGER DEFAULT 1
    );
    INSERT INTO businesses(id,name,currency,country,timezone)
      VALUES('legacy-business','Legacy shop','KES','Kenya','Africa/Nairobi');
    INSERT INTO branches(id,business_id,name)
      VALUES('legacy-main','legacy-business','Legacy main');
    PRAGMA user_version=1;
  `);
  legacy.close();
  try {
    const migrated = openDatabase(dbPath);
    try {
      const business = migrated
        .prepare("SELECT * FROM businesses WHERE id='legacy-business'")
        .get();
      const branch = migrated
        .prepare("SELECT * FROM branches WHERE id='legacy-main'")
        .get();
      assert.equal(business.name, "Legacy shop");
      assert.equal(business.category, "Retail");
      assert.equal(branch.name, "Legacy main");
      assert.equal(branch.is_default, 1);
      assert.ok(
        migrated
          .prepare("PRAGMA table_info(product_variants)")
          .all()
          .some((column) => column.name === "sku"),
      );
    } finally {
      migrated.close();
    }
  } finally {
    unlinkSync(dbPath);
  }
});
test("owner can change team roles and branch assignments; changed credentials revoke sessions", async () => {
  const owner = client();
  await owner("/auth/register", register("staff-editor@example.com"));
  const initial = await owner("/workspace");
  const second = await owner("/branches", { name: "Second" });
  const staff = await owner("/staff", {
    name: "Team member",
    email: "role-change@example.com",
    password: "TeamMemberPassword123!",
    role: "manager",
    branch_id: initial.user.branch_id,
  });
  const member = client();
  await member("/auth/login", {
    email: "role-change@example.com",
    password: "TeamMemberPassword123!",
  });
  assert.equal(
    (
      await owner(
        `/staff/${staff.id}`,
        { name: "Updated team member", role: "cashier", branch_id: second.id },
        "PUT",
      )
    ).status,
    200,
  );
  assert.equal((await member("/workspace")).status, 401);
  const newMemberSession = client();
  await newMemberSession("/auth/login", {
    email: "role-change@example.com",
    password: "TeamMemberPassword123!",
  });
  const updatedWorkspace = await newMemberSession("/workspace");
  assert.equal(updatedWorkspace.user.name, "Updated team member");
  assert.equal(updatedWorkspace.user.role, "cashier");
  assert.equal(updatedWorkspace.user.branch_id, second.id);
  assert.equal(
    (
      await newMemberSession(
        `/staff/${staff.id}`,
        {
          name: "Unauthorized",
          role: "manager",
          branch_id: second.id,
        },
        "PUT",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await owner(
        `/staff/${initial.user.id}`,
        {
          name: "Owner",
          role: "manager",
          branch_id: initial.user.branch_id,
        },
        "PUT",
      )
    ).status,
    403,
  );
});

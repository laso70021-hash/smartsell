import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const isAccountActive = (user) => {
  if (!user) return false;
  if (Number(user.active ?? 0) !== 1) return false;
  const accountStatus = user.account_status || "active";
  if (accountStatus !== "active") return false;
  if (user.expires_at && new Date(user.expires_at).getTime() <= Date.now())
    return false;
  return true;
};

export function openDatabase(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS businesses(id TEXT PRIMARY KEY,name TEXT NOT NULL,currency TEXT NOT NULL DEFAULT 'TZS',country TEXT NOT NULL,timezone TEXT NOT NULL,email TEXT DEFAULT '',phone TEXT DEFAULT '',address TEXT DEFAULT '',tax_id TEXT DEFAULT '',category TEXT NOT NULL DEFAULT 'Retail',custom_category TEXT DEFAULT '');
  CREATE TABLE IF NOT EXISTS branches(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),name TEXT NOT NULL,address TEXT DEFAULT '',phone TEXT DEFAULT '',active INTEGER DEFAULT 1,is_default INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),branch_id TEXT NOT NULL REFERENCES branches(id),name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','manager','cashier')),active INTEGER DEFAULT 1,account_status TEXT NOT NULL DEFAULT 'active' CHECK(account_status IN ('active','suspended','pending')),expires_at TEXT,is_admin INTEGER NOT NULL DEFAULT 0,theme TEXT DEFAULT 'dark');
  CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS cashier_shifts(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),branch_id TEXT NOT NULL REFERENCES branches(id),cashier_id TEXT NOT NULL REFERENCES users(id),opened_at TEXT NOT NULL,opening_cash INTEGER NOT NULL CHECK(opening_cash>=0),closed_at TEXT,expected_cash INTEGER,counted_cash INTEGER,variance INTEGER,sales_count INTEGER,sales_total INTEGER,report TEXT);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_cashier_one_open_shift ON cashier_shifts(cashier_id) WHERE closed_at IS NULL;
  CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),name TEXT NOT NULL,sku TEXT NOT NULL,barcode TEXT DEFAULT '',category TEXT DEFAULT 'General',unit TEXT DEFAULT 'piece',cost INTEGER NOT NULL CHECK(cost>=0),price INTEGER NOT NULL CHECK(price>=0),threshold INTEGER NOT NULL CHECK(threshold>=0),active INTEGER DEFAULT 1,UNIQUE(business_id,sku));
  CREATE TABLE IF NOT EXISTS stock(product_id TEXT NOT NULL REFERENCES products(id),branch_id TEXT NOT NULL REFERENCES branches(id),quantity REAL NOT NULL CHECK(quantity>=0),quantity_milli INTEGER NOT NULL DEFAULT 0 CHECK(quantity_milli>=0),PRIMARY KEY(product_id,branch_id));
  CREATE TABLE IF NOT EXISTS parties(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),kind TEXT NOT NULL CHECK(kind IN ('customer','supplier')),name TEXT NOT NULL,email TEXT DEFAULT '',phone TEXT DEFAULT '',address TEXT DEFAULT '');
  CREATE TABLE IF NOT EXISTS sales(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),branch_id TEXT NOT NULL REFERENCES branches(id),customer_id TEXT REFERENCES parties(id),reference TEXT NOT NULL,total INTEGER NOT NULL,paid INTEGER NOT NULL,discount INTEGER NOT NULL,tax INTEGER NOT NULL,method TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'completed',created_at TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),idempotency TEXT NOT NULL,payload TEXT NOT NULL,shift_id TEXT REFERENCES cashier_shifts(id),UNIQUE(business_id,idempotency));
  CREATE TABLE IF NOT EXISTS sale_items(id TEXT PRIMARY KEY,sale_id TEXT NOT NULL REFERENCES sales(id),product_id TEXT NOT NULL REFERENCES products(id),name TEXT NOT NULL,sku TEXT NOT NULL,quantity REAL NOT NULL,price INTEGER NOT NULL,cost INTEGER NOT NULL,quantity_milli INTEGER NOT NULL DEFAULT 0 CHECK(quantity_milli>=0),variant_id TEXT);
  CREATE TABLE IF NOT EXISTS purchases(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),branch_id TEXT NOT NULL REFERENCES branches(id),supplier_id TEXT NOT NULL REFERENCES parties(id),product_id TEXT NOT NULL REFERENCES products(id),quantity REAL NOT NULL,cost INTEGER NOT NULL,total INTEGER NOT NULL,paid INTEGER DEFAULT 0,status TEXT DEFAULT 'ordered',reference TEXT NOT NULL,created_at TEXT NOT NULL,quantity_milli INTEGER NOT NULL DEFAULT 0 CHECK(quantity_milli>=0),variant_id TEXT);
  CREATE TABLE IF NOT EXISTS expenses(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),branch_id TEXT NOT NULL REFERENCES branches(id),name TEXT NOT NULL,category TEXT NOT NULL,amount INTEGER NOT NULL,date TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS movements(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),branch_id TEXT NOT NULL REFERENCES branches(id),product_id TEXT NOT NULL REFERENCES products(id),delta REAL NOT NULL,reason TEXT NOT NULL,reference TEXT NOT NULL,created_at TEXT NOT NULL,delta_milli INTEGER NOT NULL DEFAULT 0,variant_id TEXT);
  CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),branch_id TEXT REFERENCES branches(id),actor_id TEXT NOT NULL REFERENCES users(id),category TEXT NOT NULL,entity TEXT NOT NULL,description TEXT NOT NULL,reference TEXT NOT NULL,amount INTEGER DEFAULT 0,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS exports(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),branch_id TEXT NOT NULL REFERENCES branches(id),name TEXT NOT NULL,scope TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_sales_scope ON sales(business_id,branch_id,created_at);
  CREATE INDEX IF NOT EXISTS idx_cashier_shifts_scope ON cashier_shifts(business_id,branch_id,closed_at,opened_at);
  CREATE INDEX IF NOT EXISTS idx_events_scope ON events(business_id,branch_id,created_at);
  CREATE INDEX IF NOT EXISTS idx_products_scope ON products(business_id);
  CREATE TABLE IF NOT EXISTS product_variants(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),product_id TEXT NOT NULL REFERENCES products(id),name TEXT NOT NULL,sku TEXT NOT NULL,barcode TEXT DEFAULT '',cost INTEGER NOT NULL CHECK(cost>=0),price INTEGER NOT NULL CHECK(price>=0),threshold REAL NOT NULL DEFAULT 0 CHECK(threshold>=0),active INTEGER NOT NULL DEFAULT 1,UNIQUE(business_id,sku));
  CREATE TABLE IF NOT EXISTS variant_stock(variant_id TEXT NOT NULL REFERENCES product_variants(id),branch_id TEXT NOT NULL REFERENCES branches(id),quantity REAL NOT NULL DEFAULT 0 CHECK(quantity>=0),quantity_milli INTEGER NOT NULL DEFAULT 0 CHECK(quantity_milli>=0),PRIMARY KEY(variant_id,branch_id));
  CREATE TABLE IF NOT EXISTS dining_tables(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),branch_id TEXT NOT NULL REFERENCES branches(id),name TEXT NOT NULL,seats INTEGER NOT NULL DEFAULT 2 CHECK(seats>0),active INTEGER NOT NULL DEFAULT 1,UNIQUE(branch_id,name));
  CREATE TABLE IF NOT EXISTS kitchen_stations(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),branch_id TEXT NOT NULL REFERENCES branches(id),name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,UNIQUE(branch_id,name));
  CREATE TABLE IF NOT EXISTS restaurant_orders(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),branch_id TEXT NOT NULL REFERENCES branches(id),table_id TEXT NOT NULL REFERENCES dining_tables(id),reference TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('open','submitted','preparing','ready','served','closed','cancelled')),notes TEXT NOT NULL DEFAULT '',created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS restaurant_order_items(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES restaurant_orders(id),product_id TEXT NOT NULL REFERENCES products(id),variant_id TEXT,station_id TEXT REFERENCES kitchen_stations(id),name TEXT NOT NULL,sku TEXT NOT NULL,quantity REAL NOT NULL CHECK(quantity>0),quantity_milli INTEGER NOT NULL CHECK(quantity_milli>0),price INTEGER NOT NULL,cost INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','preparing','ready','served','cancelled')));
  CREATE INDEX IF NOT EXISTS idx_restaurant_orders_branch ON restaurant_orders(business_id,branch_id,created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_one_active_order_per_table ON restaurant_orders(table_id) WHERE status IN ('open','submitted','preparing','ready','served');
  CREATE INDEX IF NOT EXISTS idx_restaurant_items_order ON restaurant_order_items(order_id,status);
  CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id,active);
  PRAGMA user_version=2;`);
  const columns = (table) =>
    new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  const ensureColumn = (table, name, declaration) => {
    if (!columns(table).has(name))
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${declaration}`);
  };
  ensureColumn("businesses", "category", "TEXT NOT NULL DEFAULT 'Retail'");
  ensureColumn("businesses", "custom_category", "TEXT DEFAULT ''");
  ensureColumn("sales", "shift_id", "TEXT REFERENCES cashier_shifts(id)");
  ensureColumn("branches", "is_default", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("users", "account_status", "TEXT NOT NULL DEFAULT 'active' CHECK(account_status IN ('active','suspended','pending'))");
  ensureColumn("users", "expires_at", "TEXT");
  ensureColumn("users", "is_admin", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("stock", "quantity_milli", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("sale_items", "quantity_milli", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("sale_items", "variant_id", "TEXT");
  ensureColumn("purchases", "quantity_milli", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("purchases", "variant_id", "TEXT");
  ensureColumn("movements", "delta_milli", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("movements", "variant_id", "TEXT");
  db.exec(`
    UPDATE stock SET quantity_milli=CAST(ROUND(quantity*1000) AS INTEGER) WHERE quantity_milli=0 AND quantity<>0;
    UPDATE sale_items SET quantity_milli=CAST(ROUND(quantity*1000) AS INTEGER) WHERE quantity_milli=0 AND quantity<>0;
    UPDATE purchases SET quantity_milli=CAST(ROUND(quantity*1000) AS INTEGER) WHERE quantity_milli=0 AND quantity<>0;
    UPDATE movements SET delta_milli=CAST(ROUND(delta*1000) AS INTEGER) WHERE delta_milli=0 AND delta<>0;
    UPDATE branches SET is_default=1 WHERE id=(SELECT id FROM branches b WHERE b.business_id=branches.business_id ORDER BY rowid LIMIT 1) AND NOT EXISTS (SELECT 1 FROM branches d WHERE d.business_id=branches.business_id AND d.is_default=1);
    PRAGMA user_version=2;
  `);
  return db;
}

export { isAccountActive };

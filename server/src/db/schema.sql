-- ============================================================
-- 厂房及公寓楼出租管理系统 · 数据库结构
-- 全部使用 IF NOT EXISTS，可重复执行（幂等）
-- 金额统一用 REAL，业务层四舍五入到 2 位小数
-- ============================================================

-- ==================== 一、系统权限 ====================

CREATE TABLE IF NOT EXISTS roles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL UNIQUE,
  code          TEXT    NOT NULL UNIQUE,
  -- JSON 权限集，形如 {"property":["view","create","edit","delete","export"]}
  permissions   TEXT    NOT NULL DEFAULT '{}',
  is_preset     INTEGER NOT NULL DEFAULT 0,
  remark        TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password      TEXT    NOT NULL,              -- bcrypt 哈希
  real_name     TEXT    NOT NULL,
  phone         TEXT,
  role_id       INTEGER NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'active',  -- active | disabled
  last_login_at TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (role_id) REFERENCES roles(id)
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);

CREATE TABLE IF NOT EXISTS operation_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER,
  username      TEXT,
  module        TEXT    NOT NULL,
  action        TEXT    NOT NULL,
  target        TEXT,
  detail        TEXT,
  ip            TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_logs_user    ON operation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_created ON operation_logs(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  label      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  category   TEXT    NOT NULL DEFAULT 'notice',  -- notice | water | power | safety | rule
  is_top     INTEGER NOT NULL DEFAULT 0,
  publisher  TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ==================== 二、房源 · 厂房 ====================

CREATE TABLE IF NOT EXISTS factories (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  code                   TEXT    NOT NULL UNIQUE,
  name                   TEXT    NOT NULL,
  address                TEXT    NOT NULL,
  total_area             REAL    NOT NULL DEFAULT 0,
  divisible_area         REAL    NOT NULL DEFAULT 0,
  floor_height           REAL,
  floor_load             REAL,
  floor_type             TEXT,
  transformer_capacity   REAL,
  has_crane              INTEGER NOT NULL DEFAULT 0,
  crane_tonnage          REAL,
  fire_rating            TEXT,
  env_approved           INTEGER NOT NULL DEFAULT 0,
  independent_yard       INTEGER NOT NULL DEFAULT 0,
  dorm_area              REAL,
  yard_area              REAL,
  truck_access           TEXT,
  forbidden_industry     TEXT,
  rent_price             REAL    NOT NULL DEFAULT 0,
  property_fee           REAL    NOT NULL DEFAULT 0,
  water_price            REAL,
  electric_price         REAL,
  min_lease_months       INTEGER NOT NULL DEFAULT 12,
  allow_sublet           INTEGER NOT NULL DEFAULT 0,
  status                 TEXT    NOT NULL DEFAULT 'vacant',  -- vacant | rented | disabled
  images                 TEXT    NOT NULL DEFAULT '[]',
  attachments            TEXT    NOT NULL DEFAULT '[]',
  remark                 TEXT,
  created_at             TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at             TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_factories_status ON factories(status);
CREATE INDEX IF NOT EXISTS idx_factories_name   ON factories(name);

-- ==================== 三、房源 · 公寓（楼栋-楼层-房间） ====================

CREATE TABLE IF NOT EXISTS buildings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL UNIQUE,
  floors       INTEGER NOT NULL DEFAULT 1,
  address      TEXT,
  has_elevator INTEGER NOT NULL DEFAULT 0,
  remark       TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS apartments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT    NOT NULL UNIQUE,
  building_id     INTEGER NOT NULL,
  building_name   TEXT    NOT NULL,
  floor           INTEGER NOT NULL,
  room_no         TEXT    NOT NULL,
  layout          TEXT,
  area            REAL    NOT NULL DEFAULT 0,
  orientation     TEXT,
  has_elevator    INTEGER NOT NULL DEFAULT 0,
  furniture       TEXT,
  allow_pet       INTEGER NOT NULL DEFAULT 0,
  occupancy_limit INTEGER,
  monthly_rent    REAL    NOT NULL DEFAULT 0,
  deposit_amount  REAL    NOT NULL DEFAULT 0,
  property_fee    REAL    NOT NULL DEFAULT 0,
  water_price     REAL,
  electric_price  REAL,
  utility_type    TEXT    NOT NULL DEFAULT 'civil',  -- civil | commercial
  status          TEXT    NOT NULL DEFAULT 'vacant', -- vacant | rented | repair
  images          TEXT    NOT NULL DEFAULT '[]',
  remark          TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (building_id) REFERENCES buildings(id)
);
CREATE INDEX IF NOT EXISTS idx_apartments_building ON apartments(building_id);
CREATE INDEX IF NOT EXISTS idx_apartments_status   ON apartments(status);
CREATE INDEX IF NOT EXISTS idx_apartments_floor    ON apartments(building_id, floor);

-- ==================== 四、租客 ====================

CREATE TABLE IF NOT EXISTS tenants (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT    NOT NULL DEFAULT 'person',  -- person | company
  name         TEXT    NOT NULL,
  contact_name TEXT,
  phone        TEXT    NOT NULL,
  id_card      TEXT,
  id_card_file TEXT,
  license_file TEXT,
  tags         TEXT    NOT NULL DEFAULT '[]',      -- JSON: intent|signed|arrears|renew
  address      TEXT,
  remark       TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_tenants_phone ON tenants(phone);
CREATE INDEX IF NOT EXISTS idx_tenants_name  ON tenants(name);

-- ==================== 五、租约合同 ====================

CREATE TABLE IF NOT EXISTS leases (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_no             TEXT    NOT NULL UNIQUE,
  tenant_id            INTEGER NOT NULL,
  property_type        TEXT    NOT NULL,              -- factory | apartment
  start_date           TEXT    NOT NULL,
  end_date             TEXT    NOT NULL,
  pay_cycle            TEXT    NOT NULL DEFAULT 'month',  -- month | quarter | year
  monthly_rent         REAL    NOT NULL DEFAULT 0,        -- Σ 关联房源月租金
  monthly_property_fee REAL    NOT NULL DEFAULT 0,
  deposit_amount       REAL    NOT NULL DEFAULT 0,
  decoration_total     REAL    NOT NULL DEFAULT 0,        -- 装修总金额
  decoration_periods   INTEGER NOT NULL DEFAULT 0,        -- 抵扣期数
  decoration_per_month REAL    NOT NULL DEFAULT 0,        -- 每期抵扣额
  decoration_deducted  REAL    NOT NULL DEFAULT 0,        -- 累计已抵扣
  extra_clause         TEXT,
  attachment           TEXT,
  status               TEXT    NOT NULL DEFAULT 'active', -- active|expiring|expired|terminated|breach
  sign_date            TEXT,
  terminate_date       TEXT,
  terminate_reason     TEXT,
  remark               TEXT,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_leases_tenant ON leases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leases_status ON leases(status);
CREATE INDEX IF NOT EXISTS idx_leases_end    ON leases(end_date);
CREATE INDEX IF NOT EXISTS idx_leases_type   ON leases(property_type);

-- 租约与房源的多对多：单/多套公寓、单栋/分割厂房
CREATE TABLE IF NOT EXISTS lease_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id            INTEGER NOT NULL,
  property_type       TEXT    NOT NULL,
  property_id         INTEGER NOT NULL,
  property_name       TEXT    NOT NULL,
  monthly_rent        REAL    NOT NULL DEFAULT 0,
  monthly_property_fee REAL   NOT NULL DEFAULT 0,
  remark              TEXT,
  FOREIGN KEY (lease_id) REFERENCES leases(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lease_items_lease    ON lease_items(lease_id);
CREATE INDEX IF NOT EXISTS idx_lease_items_property ON lease_items(property_type, property_id);

-- ==================== 六、财务账单 ====================

CREATE TABLE IF NOT EXISTS bills (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_no             TEXT    NOT NULL UNIQUE,
  lease_id            INTEGER NOT NULL,
  tenant_id           INTEGER NOT NULL,
  property_type       TEXT    NOT NULL,
  period_index        INTEGER NOT NULL,
  period_start        TEXT    NOT NULL,
  period_end          TEXT    NOT NULL,
  due_date            TEXT    NOT NULL,
  rent_amount         REAL    NOT NULL DEFAULT 0,
  property_fee        REAL    NOT NULL DEFAULT 0,
  other_amount        REAL    NOT NULL DEFAULT 0,
  decoration_deduction REAL   NOT NULL DEFAULT 0,
  payable_amount      REAL    NOT NULL DEFAULT 0,
  paid_amount         REAL    NOT NULL DEFAULT 0,
  status              TEXT    NOT NULL DEFAULT 'pending', -- pending|paid|overdue|partial
  remark              TEXT,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (lease_id) REFERENCES leases(id) ON DELETE CASCADE,
  UNIQUE (lease_id, period_index)
);
CREATE INDEX IF NOT EXISTS idx_bills_lease  ON bills(lease_id);
CREATE INDEX IF NOT EXISTS idx_bills_tenant ON bills(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_due    ON bills(due_date);
CREATE INDEX IF NOT EXISTS idx_bills_period ON bills(period_start, period_end);

CREATE TABLE IF NOT EXISTS bill_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id    INTEGER NOT NULL,
  type       TEXT    NOT NULL,   -- rent|property|water|electric|parking|penalty|deduction|other
  name       TEXT    NOT NULL,
  amount     REAL    NOT NULL DEFAULT 0,
  remark     TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id);

CREATE TABLE IF NOT EXISTS payments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id    INTEGER NOT NULL,
  lease_id   INTEGER NOT NULL,
  tenant_id  INTEGER NOT NULL,
  amount     REAL    NOT NULL DEFAULT 0,
  pay_date   TEXT    NOT NULL,
  method     TEXT    NOT NULL DEFAULT 'transfer', -- transfer|cash|wechat|alipay|check
  operator   TEXT,
  remark     TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payments_bill   ON payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_lease  ON payments(lease_id);
CREATE INDEX IF NOT EXISTS idx_payments_date   ON payments(pay_date);

-- 押金台账：收取、退还、抵扣全程留痕
CREATE TABLE IF NOT EXISTS deposit_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id    INTEGER NOT NULL,
  tenant_id   INTEGER NOT NULL,
  type        TEXT    NOT NULL,   -- collect 收取 | refund 退还 | deduct 抵扣
  amount      REAL    NOT NULL DEFAULT 0,
  happen_date TEXT    NOT NULL,
  remark      TEXT,
  operator    TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (lease_id) REFERENCES leases(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_deposit_lease ON deposit_records(lease_id);

-- ==================== 七、消息通知 ====================

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT    NOT NULL,   -- lease_expire | bill_overdue | work_order | system
  title      TEXT    NOT NULL,
  content    TEXT,
  level      TEXT    NOT NULL DEFAULT 'info',  -- info | warning | danger
  related_id INTEGER,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);

-- ==================== 八、占位模块（本期仅预留结构） ====================

CREATE TABLE IF NOT EXISTS viewings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_name   TEXT    NOT NULL,
  phone         TEXT    NOT NULL,
  property_type TEXT    NOT NULL,
  property_id   INTEGER,
  property_name TEXT,
  appoint_time  TEXT,
  status        TEXT    NOT NULL DEFAULT 'pending', -- pending|appointed|viewed|no_intent|signed
  remark        TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_viewings_status ON viewings(status);

CREATE TABLE IF NOT EXISTS work_orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no      TEXT    NOT NULL UNIQUE,
  property_type TEXT    NOT NULL,
  property_id   INTEGER,
  property_name TEXT,
  reporter      TEXT    NOT NULL,
  phone         TEXT,
  fault_desc    TEXT    NOT NULL,
  images        TEXT    NOT NULL DEFAULT '[]',
  status        TEXT    NOT NULL DEFAULT 'pending', -- pending|repairing|done|closed
  assignee      TEXT,
  cost          REAL    NOT NULL DEFAULT 0,
  progress      TEXT,
  finish_remark TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);

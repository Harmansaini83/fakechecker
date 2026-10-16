CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE manufacturers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  license_no TEXT NOT NULL UNIQUE,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manufacturer','moderator','admin')),
  manufacturer_id INT REFERENCES manufacturers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  manufacturer_id INT NOT NULL REFERENCES manufacturers(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('seed','pesticide','fertilizer')),
  registration_no TEXT NOT NULL UNIQUE,
  approved_states TEXT[] NOT NULL DEFAULT '{}',
  data_source TEXT NOT NULL DEFAULT 'demo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE batches (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id),
  batch_code TEXT NOT NULL,
  mfg_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','recalled')),
  recall_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, batch_code),
  CHECK (expiry_date > mfg_date)
);

CREATE TABLE packages (
  id SERIAL PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  batch_id INT NOT NULL REFERENCES batches(id),
  key_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','revoked','counterfeit_confirmed')),
  first_scan_at TIMESTAMPTZ,
  scan_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_packages_batch ON packages(batch_id);

CREATE TABLE scans (
  id BIGSERIAL PRIMARY KEY,
  package_id INT REFERENCES packages(id),
  raw_code TEXT NOT NULL,
  scan_mode TEXT NOT NULL DEFAULT 'farmer' CHECK (scan_mode IN ('farmer','retailer')),
  location GEOGRAPHY(Point, 4326),
  verdict TEXT NOT NULL,
  risk_score INT NOT NULL DEFAULT 0,
  reasons JSONB NOT NULL DEFAULT '[]',
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_scans_package_time ON scans(package_id, scanned_at DESC);

CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  product_name TEXT,
  batch_code TEXT,
  description TEXT,
  store_type TEXT,
  photo_path TEXT,
  location GEOGRAPHY(Point, 4326),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  moderated_by INT REFERENCES admin_users(id),
  moderated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id INT REFERENCES admin_users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
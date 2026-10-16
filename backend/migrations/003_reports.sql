CREATE TABLE fraud_reports (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('suspected_fake','wrong_product','damaged_seal','overpriced','other')),
  description TEXT,
  purchase_place TEXT,
  contact TEXT,
  geom geography(Point, 4326),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','confirmed','rejected','duplicate')),
  duplicate_of BIGINT REFERENCES fraud_reports(id),
  reviewed_by INT REFERENCES admin_users(id),
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fr_status ON fraud_reports(status, created_at DESC);
CREATE INDEX idx_fr_hash ON fraud_reports(code_hash);
CREATE INDEX idx_fr_geom ON fraud_reports USING GIST(geom);

CREATE TABLE report_evidence (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES fraud_reports(id) ON DELETE CASCADE,
  stored_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
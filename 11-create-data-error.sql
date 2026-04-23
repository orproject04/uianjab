-- Create data_error table (first run)
CREATE TABLE IF NOT EXISTS data_error (
    id BIGSERIAL PRIMARY KEY,
    nip TEXT NOT NULL,
    nama TEXT NOT NULL,
    jabatan TEXT NOT NULL,
    unit_organisasi TEXT,
    status TEXT,
    saran_perbaikan TEXT,
    synced_by VARCHAR(255),
    synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_data_error_synced_at ON data_error (synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_error_nip ON data_error (nip);

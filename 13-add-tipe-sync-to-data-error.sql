ALTER TABLE data_error ADD COLUMN IF NOT EXISTS tipe_sync VARCHAR(2) DEFAULT 'ST' NOT NULL;
CREATE INDEX IF NOT EXISTS idx_data_error_tipe_sync ON data_error (tipe_sync);

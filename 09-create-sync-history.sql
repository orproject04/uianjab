-- Create sync_history table to track pegawai synchronization history
CREATE TABLE IF NOT EXISTS sync_history (
    id SERIAL PRIMARY KEY,
    sync_type VARCHAR(50) NOT NULL DEFAULT 'pegawai',
    total_fetched INTEGER NOT NULL DEFAULT 0,
    total_matched INTEGER NOT NULL DEFAULT 0,
    total_unmatched INTEGER NOT NULL DEFAULT 0,
    total_inactive INTEGER NOT NULL DEFAULT 0,
    errors TEXT[], -- Array of error messages
    log_file_json TEXT, -- Path to JSON log file
    log_file_csv TEXT, -- Path to CSV log file
    synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    synced_by VARCHAR(255), -- User who performed the sync
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries on sync_type and synced_at
CREATE INDEX IF NOT EXISTS idx_sync_history_sync_type ON sync_history(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_history_synced_at ON sync_history(synced_at DESC);

-- Add comment to table
COMMENT ON TABLE sync_history IS 'Tracks history of data synchronization operations';
COMMENT ON COLUMN sync_history.sync_type IS 'Type of sync operation (e.g., pegawai)';
COMMENT ON COLUMN sync_history.total_fetched IS 'Total number of records fetched from external API';
COMMENT ON COLUMN sync_history.total_matched IS 'Number of records matched with existing jabatan';
COMMENT ON COLUMN sync_history.total_unmatched IS 'Number of records that could not be matched';
COMMENT ON COLUMN sync_history.total_inactive IS 'Number of inactive employees (status != ACTIVE)';
COMMENT ON COLUMN sync_history.errors IS 'Array of error messages encountered during sync';
COMMENT ON COLUMN sync_history.log_file_json IS 'Full path to JSON log file for unmatched records';
COMMENT ON COLUMN sync_history.log_file_csv IS 'Full path to CSV log file for unmatched records';
COMMENT ON COLUMN sync_history.synced_at IS 'Timestamp when the sync was performed (timezone-aware)';
COMMENT ON COLUMN sync_history.synced_by IS 'Username or email of user who performed the sync';

-- Migration 12: Add pejabat_sk to peta_jabatan
-- Rename existing pejabat column to pejabat_st
ALTER TABLE peta_jabatan RENAME COLUMN pejabat TO pejabat_st;

-- Add new column pejabat_sk to store SK Sync Data
ALTER TABLE peta_jabatan ADD COLUMN pejabat_sk jsonb NOT NULL DEFAULT '[]'::jsonb;

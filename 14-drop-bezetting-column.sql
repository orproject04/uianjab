-- Migration: Drop bezetting column from peta_jabatan
-- Description: Bezetting is now dynamically calculated from pejabat_st and pejabat_sk arrays.

ALTER TABLE peta_jabatan DROP COLUMN IF EXISTS bezetting;

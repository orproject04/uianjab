-- Migration: Update peta_jabatan.slug to use only last 2 segments
-- Description: Change slug from full path to last 2 segments (e.g., "depmin-okk" instead of "setjen-depmin-okk")
BEGIN;

-- Update all peta_jabatan slugs to only keep last 2 segments from current slug
UPDATE peta_jabatan
SET slug = CASE 
    -- If slug has 2 or more dashes (3+ segments), take last 2 segments
    WHEN slug ~ '.*-.*-.*' THEN 
        substring(slug from '(?:.*-)?(.+-[^-]+)$')
    -- Otherwise keep as is (1 or 2 segments already)
    ELSE slug
  END,
  updated_at = NOW()
WHERE slug ~ '.*-.*-.*';  -- Only update slugs with 3+ segments

-- Verification
DO $$
DECLARE
    v_updated INTEGER;
    v_sample RECORD;
BEGIN
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    
    RAISE NOTICE '=== Slug Update to Last 2 Segments Complete ===';
    RAISE NOTICE 'Records updated: %', v_updated;
    
    -- Show some examples at different levels
    RAISE NOTICE 'Sample slugs by level:';
    FOR v_sample IN 
        SELECT level, nama_jabatan, slug 
        FROM peta_jabatan 
        WHERE level <= 3
        ORDER BY level, slug 
        LIMIT 15
    LOOP
        RAISE NOTICE 'Level %: % -> %', v_sample.level, v_sample.nama_jabatan, v_sample.slug;
    END LOOP;
END $$;

COMMIT;

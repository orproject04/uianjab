-- Migration: Update peta_jabatan.slug to include full parent path
-- Description: Change slug from single segment to full path (e.g., "setjen-depmin" instead of just "depmin")
BEGIN;

-- Update all peta_jabatan slugs to include parent path
WITH RECURSIVE tree AS (
  -- Root nodes: slug stays as is
  SELECT 
    id,
    parent_id,
    slug,
    slug AS full_slug
  FROM peta_jabatan
  WHERE parent_id IS NULL
  
  UNION ALL
  
  -- Child nodes: prepend parent slug with dash
  SELECT 
    c.id,
    c.parent_id,
    c.slug,
    t.full_slug || '-' || c.slug AS full_slug
  FROM peta_jabatan c
  JOIN tree t ON c.parent_id = t.id
)
UPDATE peta_jabatan p
SET slug = t.full_slug,
    updated_at = NOW()
FROM tree t
WHERE p.id = t.id
  AND p.slug != t.full_slug;  -- Only update if different

-- Verification
DO $$
DECLARE
    v_updated INTEGER;
    v_sample RECORD;
BEGIN
    SELECT COUNT(*) INTO v_updated 
    FROM peta_jabatan 
    WHERE slug LIKE '%-%';
    
    RAISE NOTICE '=== Slug Update Complete ===';
    RAISE NOTICE 'Peta jabatan with dash in slug (has parent): %', v_updated;
    
    -- Show some examples
    RAISE NOTICE 'Sample slugs:';
    FOR v_sample IN 
        SELECT level, nama_jabatan, slug 
        FROM peta_jabatan 
        ORDER BY level, slug 
        LIMIT 10
    LOOP
        RAISE NOTICE 'Level %: % -> %', v_sample.level, v_sample.nama_jabatan, v_sample.slug;
    END LOOP;
END $$;

COMMIT;

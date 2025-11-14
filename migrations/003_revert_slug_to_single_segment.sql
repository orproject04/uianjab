-- Migration: Revert slug to single segment (remove parent path prefix)
-- This reverts the changes from migration 002

BEGIN;

-- Update all slugs to keep only the last segment
UPDATE peta_jabatan
SET slug = substring(slug from '[^-]+$')
WHERE slug LIKE '%-%';

-- Verify: Check that no slugs have dashes anymore (all single segment)
DO $$
DECLARE
    dash_count int;
BEGIN
    SELECT COUNT(*) INTO dash_count
    FROM peta_jabatan
    WHERE slug LIKE '%-%';
    
    IF dash_count > 0 THEN
        RAISE EXCEPTION 'Still have % slugs with dashes after revert', dash_count;
    END IF;
    
    RAISE NOTICE 'Successfully reverted all slugs to single segment';
END $$;

COMMIT;

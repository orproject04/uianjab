-- Update existing rekom_jf paths to use /api/files/ prefix
-- This is needed to serve files through Next.js API route instead of static files

UPDATE rekom_jf
SET kemenpan_path = REPLACE(kemenpan_path, '/storage/', '/api/files/')
WHERE kemenpan_path IS NOT NULL 
  AND kemenpan_path LIKE '/storage/%';

UPDATE rekom_jf
SET instansi_pembina_path = REPLACE(instansi_pembina_path, '/storage/', '/api/files/')
WHERE instansi_pembina_path IS NOT NULL 
  AND instansi_pembina_path LIKE '/storage/%';

-- Show updated records
SELECT id, nama, kemenpan_path, instansi_pembina_path 
FROM rekom_jf 
ORDER BY created_at DESC;

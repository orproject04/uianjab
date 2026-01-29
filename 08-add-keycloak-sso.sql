-- Migration: Add Keycloak SSO support to user_anjab table
-- File: 08-add-keycloak-sso.sql

-- Add keycloak_sub column to store Keycloak user ID
ALTER TABLE user_anjab 
ADD COLUMN IF NOT EXISTS keycloak_sub VARCHAR(255) UNIQUE;

-- Create index for faster lookup
CREATE INDEX IF NOT EXISTS idx_user_anjab_keycloak_sub 
ON user_anjab(keycloak_sub);

-- Add comment
COMMENT ON COLUMN user_anjab.keycloak_sub IS 'Keycloak user subject ID for SSO authentication';

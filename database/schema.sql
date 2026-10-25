-- TrustVault clean-install schema.
-- IMPORTANT: Run only against a separate, empty PostgreSQL database.
-- Never run this file against an existing or production database.

BEGIN;

DO $guard$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
              'users',
              'documents',
              'document_permissions',
              'audit_logs',
              'password_reset_codes'
          )
    ) THEN
        RAISE EXCEPTION
          'TrustVault tables already exist. Aborting clean installation.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname IN (
              'user_role',
              'permission_type',
              'audit_action'
          )
    ) THEN
        RAISE EXCEPTION
          'TrustVault enum types already exist. Aborting clean installation.';
    END IF;
END;
$guard$;

CREATE TYPE user_role AS ENUM ('admin', 'owner', 'viewer');
CREATE TYPE permission_type AS ENUM ('read', 'edit');
CREATE TYPE audit_action AS ENUM (
    'login',
    'logout',
    'upload',
    'download',
    'view',
    'update',
    'delete',
    'permission_granted',
    'permission_revoked',
    'permission_changed',
    'access_denied'
);

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(120) NOT NULL,
    email varchar(255) NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role user_role NOT NULL DEFAULT 'viewer',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,
    name varchar(255) NOT NULL,
    description text,
    category varchar(100),
    storage_path text NOT NULL UNIQUE,
    original_filename varchar(255) NOT NULL,
    mime_type varchar(150) NOT NULL,
    file_size bigint NOT NULL CHECK (file_size >= 0),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    is_deleted boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE document_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL
        REFERENCES documents(id) ON DELETE CASCADE,
    user_id uuid NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    permission permission_type NOT NULL,
    granted_by uuid NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,
    is_active boolean NOT NULL DEFAULT true,
    granted_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_document_user_permission
        UNIQUE (document_id, user_id)
);

CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
    action audit_action NOT NULL,
    success boolean NOT NULL,
    ip_address inet,
    user_agent text,
    details jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_codes (
    email varchar(255) PRIMARY KEY,
    code_hash char(64) NOT NULL,
    expires_at timestamptz NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Match the existing database indexes.
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_created_at ON documents(created_at);
CREATE INDEX idx_documents_name ON documents(name);
CREATE INDEX idx_documents_not_deleted ON documents(is_deleted);
CREATE INDEX idx_documents_owner ON documents(owner_id);

CREATE INDEX idx_permissions_active ON document_permissions(is_active);
CREATE INDEX idx_permissions_document ON document_permissions(document_id);
CREATE INDEX idx_permissions_user ON document_permissions(user_id);

CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_document ON audit_logs(document_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);

-- Maintain updated_at on row updates.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

CREATE TRIGGER users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER documents_updated_at
BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER permissions_updated_at
BEFORE UPDATE ON document_permissions
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Protect audit records against updates and deletes.
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'Audit records cannot be modified or deleted';
END;
$function$;

CREATE TRIGGER prevent_audit_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

CREATE TRIGGER prevent_audit_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

COMMIT;

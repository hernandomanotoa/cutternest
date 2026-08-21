-- ============================================
-- CutterNest - Schema PostgreSQL
-- ============================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    telefono VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    totp_secret VARCHAR(255),
    totp_enabled BOOLEAN DEFAULT true,
    email_otp_enabled BOOLEAN DEFAULT false,
    sms_otp_enabled BOOLEAN DEFAULT false,
    whatsapp_otp_enabled BOOLEAN DEFAULT false,
    backup_codes_hash TEXT[],
    is_active BOOLEAN DEFAULT true,
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    device_info VARCHAR(255),
    ip_address INET,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guest_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pin VARCHAR(4) NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE CASCADE,
    project_name VARCHAR(255),
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS otp_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    method VARCHAR(20) NOT NULL CHECK (method IN ('totp', 'email', 'sms', 'whatsapp')),
    code_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    attempts INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo VARCHAR(50) NOT NULL,
    espesor_mm INTEGER NOT NULL,
    ancho_mm DECIMAL(10,2) NOT NULL,
    alto_mm DECIMAL(10,2) NOT NULL,
    cantidad INTEGER DEFAULT 1,
    ubicacion VARCHAR(100),
    estado VARCHAR(20) DEFAULT 'nuevo',
    proyecto_origen UUID,
    area_m2 DECIMAL(10,6) GENERATED ALWAYS AS ((ancho_mm * alto_mm) / 1000000) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    tablero_config JSONB NOT NULL,
    piezas JSONB NOT NULL,
    resultados JSONB,
    estado VARCHAR(20) DEFAULT 'activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL,
    telefono VARCHAR(20),
    email VARCHAR(255),
    direccion TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ordenes_trabajo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_orden VARCHAR(50) UNIQUE NOT NULL,
    cliente_id UUID REFERENCES clientes(id),
    proyecto_id UUID REFERENCES projects(id),
    estado VARCHAR(20) DEFAULT 'pendiente',
    fecha_entrega DATE,
    costo_total DECIMAL(10,2),
    notas TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notificaciones_config (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    whatsapp_notificaciones BOOLEAN DEFAULT false,
    sms_notificaciones BOOLEAN DEFAULT false,
    email_notificaciones BOOLEAN DEFAULT false,
    whatsapp_gateway_url TEXT DEFAULT 'http://whatsapp-gateway:8080/send',
    sms_gateway_url TEXT,
    sms_gateway_token TEXT
);

CREATE TABLE IF NOT EXISTS notificaciones_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    orden_id UUID REFERENCES ordenes_trabajo(id),
    destinatario VARCHAR(20) NOT NULL,
    canal VARCHAR(20) NOT NULL,
    mensaje TEXT NOT NULL,
    estado VARCHAR(20) DEFAULT 'enviado',
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS costos_config (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    costo_mdf_m2 DECIMAL(10,2) DEFAULT 8.50,
    costo_melamina_m2 DECIMAL(10,2) DEFAULT 12.00,
    costo_hora_mano_obra DECIMAL(10,2) DEFAULT 5.00,
    factor_desperdicio DECIMAL(5,2) DEFAULT 1.15,
    margen_ganancia DECIMAL(5,2) DEFAULT 1.30
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh ON sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_otp_user ON otp_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_estado ON inventory(estado);
CREATE INDEX IF NOT EXISTS idx_inventory_tipo ON inventory(tipo);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_cliente ON ordenes_trabajo(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_estado ON ordenes_trabajo(estado);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

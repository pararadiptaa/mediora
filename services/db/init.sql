-- Mediora — init.sql
-- Automatically run by PostgreSQL on first container start.

-- ────────────────────────────────────────────────────────────────
-- Users Table
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    user_id     VARCHAR(50)  NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    email       VARCHAR(100),
    phone       VARCHAR(20),
    role        VARCHAR(50) DEFAULT 'patient',
    status      VARCHAR(50) DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────
-- Doctors Table
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doctors (
    id          SERIAL PRIMARY KEY,
    doctor_id   VARCHAR(50)  NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    specialty   VARCHAR(100) NOT NULL,
    facility    VARCHAR(200),
    phone       VARCHAR(20),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────
-- Appointments Table
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
    id               SERIAL PRIMARY KEY,
    user_id          VARCHAR(50)  NOT NULL,
    user_name        VARCHAR(100) NOT NULL,
    doctor           VARCHAR(100) NOT NULL,
    specialty        VARCHAR(100) NOT NULL,
    appointment_date TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '1 day',
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────
-- Medical Records Table
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medical_records (
    id          SERIAL PRIMARY KEY,
    user_id     VARCHAR(50)  NOT NULL,
    record_date DATE         NOT NULL,
    record_type VARCHAR(100) NOT NULL,
    icon        VARCHAR(50),
    doctor_name VARCHAR(100),
    facility    VARCHAR(200),
    status      VARCHAR(50) DEFAULT 'completed',
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────
-- Insert Sample Users
-- ────────────────────────────────────────────────────────────────
INSERT INTO users (user_id, name, email, phone, role, status) VALUES
    ('user1', 'Budi', 'budi@mediora.com', '+62-811-22-3344', 'patient', 'active'),
    ('user2', 'Siti', 'siti@mediora.com', '+62-812-55-6677', 'patient', 'active'),
    ('user3', 'John', 'john@mediora.com', '+1-555-123-4567', 'patient', 'active')
ON CONFLICT (user_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- Insert Sample Doctors
-- ────────────────────────────────────────────────────────────────
INSERT INTO doctors (doctor_id, name, specialty, facility, phone) VALUES
    ('doc1', 'Dr. Siska', 'Dentistry', 'Dental Wing, Room 105', '+62-821-99-8877'),
    ('doc2', 'Dr. Tirta', 'Cardiology', 'Room 304, Main Building', '+62-821-44-5566'),
    ('doc3', 'Dr. Chaos', 'Neurology', 'Neurology Dept, 3F', '+62-821-77-8899')
ON CONFLICT (doctor_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- Insert Sample Medical Records for Siti (user2)
-- ────────────────────────────────────────────────────────────────
INSERT INTO medical_records (user_id, record_date, record_type, icon, doctor_name, facility, status, description) VALUES
    ('user2', '2024-02-28', 'Blood Test (CBC)', 'bloodtype', 'Dr. Sarah Jenkins', 'Mediora Main Lab', 'completed', 'Complete blood count showing normal levels'),
    ('user2', '2024-02-15', 'Chest X-Ray', 'radiology', 'Dr. Tirta', 'Radiology Dept, 2F', 'completed', 'Chest imaging - no abnormalities detected'),
    ('user2', '2024-01-30', 'Dental Cleaning', 'dentistry', 'Dr. Siska', 'Dental Wing, Room 105', 'completed', 'Regular dental cleaning and examination'),
    ('user2', '2024-01-10', 'Cardiology Consultation', 'ecg_heart', 'Dr. Tirta', 'Room 304, Main Building', 'completed', 'Routine heart health check - all clear'),
    ('user2', '2023-12-20', 'Lab Work - Thyroid Panel', 'bloodtype', 'Dr. Emily Williams', 'Lab, 1F', 'completed', 'Thyroid function tests within normal range'),
    ('user2', '2023-11-15', 'Neurological Exam', 'monitoring', 'Dr. Chaos', 'Neurology Dept, 3F', 'archived', 'Standard neurological assessment completed')
ON CONFLICT DO NOTHING;

-- Mediora — init.sql
-- Automatically run by PostgreSQL on first container start.

-- ────────────────────────────────────────────────────────────────
-- Users Table
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    user_id     VARCHAR(50)  PRIMARY KEY,
    name        VARCHAR(100) NOT NULL
);

-- ────────────────────────────────────────────────────────────────
-- Doctors Table
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doctors (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    specialty   VARCHAR(100) NOT NULL
);

-- ────────────────────────────────────────────────────────────────
-- Appointments Table
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
    id               SERIAL PRIMARY KEY,
    user_id          VARCHAR(50)  NOT NULL,
    doctor_id        INT          NOT NULL,
    appointment_date TIMESTAMP    NOT NULL DEFAULT NOW() + INTERVAL '1 day',
    status           VARCHAR(50)  NOT NULL DEFAULT 'scheduled',
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────
-- Medical Records Table
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medical_records (
    id          SERIAL PRIMARY KEY,
    user_id     VARCHAR(50)  NOT NULL,
    record_date TIMESTAMP    NOT NULL DEFAULT NOW(),
    record_type VARCHAR(100) NOT NULL,
    icon        VARCHAR(50),
    doctor_name VARCHAR(100),
    facility    VARCHAR(200),
    status      VARCHAR(50)  DEFAULT 'completed',
    description TEXT,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────
-- Seed Data: Users
-- ────────────────────────────────────────────────────────────────
INSERT INTO users (user_id, name) VALUES
    ('siti', 'Siti Aminah'),
    ('budi', 'Budi Santoso')
ON CONFLICT (user_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- Seed Data: Doctors
-- ────────────────────────────────────────────────────────────────
INSERT INTO doctors (name, specialty) VALUES
    ('Dr. Siska', 'Dentistry'),
    ('Dr. Tirta', 'Cardiology'),
    ('Dr. Chaos', 'Neurology')
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- Seed Data: Medical Records
-- ────────────────────────────────────────────────────────────────
-- Seeds for Siti
INSERT INTO medical_records (user_id, record_date, record_type, icon, doctor_name, facility, status, description) VALUES
    ('siti', '2024-02-28 10:00:00', 'Blood Test (CBC)', 'bloodtype', 'Dr. Sarah Jenkins', 'Mediora Main Lab', 'completed', 'Complete blood count showing normal levels'),
    ('siti', '2024-02-15 14:30:00', 'Chest X-Ray', 'radiology', 'Dr. Tirta', 'Radiology Dept, 2F', 'completed', 'Chest imaging - no abnormalities detected');

-- Seeds for Budi
INSERT INTO medical_records (user_id, record_date, record_type, icon, doctor_name, facility, status, description) VALUES
    ('budi', '2024-01-30 09:15:00', 'Dental Cleaning', 'dentistry', 'Dr. Siska', 'Dental Wing, Room 105', 'completed', 'Regular dental cleaning and examination'),
    ('budi', '2024-01-10 11:00:00', 'Cardiology Consultation', 'ecg_heart', 'Dr. Tirta', 'Room 304, Main Building', 'completed', 'Routine heart health check - all clear');

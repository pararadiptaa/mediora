-- Mediora — init.sql
-- Automatically run by PostgreSQL on first container start.
-- DB is intentionally ephemeral (no pgdata volume) so this always runs fresh.

-- ────────────────────────────────────────────────────────────────
-- Users Table
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    user_id     VARCHAR(50)  PRIMARY KEY,
    name        VARCHAR(100) NOT NULL
);

-- ────────────────────────────────────────────────────────────────
-- Doctors Table
-- UNIQUE on name so ON CONFLICT DO NOTHING works correctly.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doctors (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
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
    status           VARCHAR(50)  NOT NULL DEFAULT 'pending',
    FOREIGN KEY (user_id)   REFERENCES users(user_id)   ON DELETE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES doctors(id)       ON DELETE CASCADE
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
-- Billing Transactions Table
-- Inserted by billing-api after every successful payment.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_transactions (
    id             SERIAL PRIMARY KEY,
    appointment_id INT            NOT NULL,
    user_id        VARCHAR(50)    NOT NULL,
    invoice        VARCHAR(100),
    amount         NUMERIC(10, 2) NOT NULL,
    status         VARCHAR(50)    NOT NULL DEFAULT 'paid',
    created_at     TIMESTAMP      NOT NULL DEFAULT NOW(),
    FOREIGN KEY (appointment_id) REFERENCES appointments(id)  ON DELETE CASCADE,
    FOREIGN KEY (user_id)        REFERENCES users(user_id)    ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────
-- Seed Data: Users
-- Includes all three demo personas used by login.html and bot.js.
-- ────────────────────────────────────────────────────────────────
INSERT INTO users (user_id, name) VALUES
    ('budi', 'Budi Santoso'),
    ('siti', 'Siti Aminah'),
    ('john', 'John Doe')
ON CONFLICT (user_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- Seed Data: Doctors
-- Names MUST match the values in appointment-api DOCTOR_NAME_MAP.
-- ────────────────────────────────────────────────────────────────
INSERT INTO doctors (name, specialty) VALUES
    ('Dr. Siska',         'Dentistry'),
    ('Dr. Tirta',         'Cardiology'),
    ('Dr. Chaos',         'Neurology'),
    ('Dr. Sarah Smith',   'Cardiology'),
    ('Dr. Lim',           'Dentistry'),
    ('Dr. Michael Jones', 'General Practice'),
    ('Dr. Emily Williams','General Practice'),
    ('Dr. Patel',         'Dermatology'),
    ('Dr. Wong',          'Neurology')
ON CONFLICT (name) DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- Seed Data: Medical Records (for Siti — has existing records)
-- ────────────────────────────────────────────────────────────────
INSERT INTO medical_records (user_id, record_date, record_type, icon, doctor_name, facility, status, description) VALUES
    ('siti', '2024-02-28 10:00:00', 'Blood Test (CBC)',        'bloodtype',  'Dr. Sarah Jenkins', 'Mediora Main Lab',         'completed', 'Complete blood count showing normal levels'),
    ('siti', '2024-02-15 14:30:00', 'Chest X-Ray',             'radiology',  'Dr. Tirta',          'Radiology Dept, 2F',        'completed', 'Chest imaging — no abnormalities detected');

-- ────────────────────────────────────────────────────────────────
-- Seed Data: Medical Records (for Budi — clean slate with 1 past record)
-- ────────────────────────────────────────────────────────────────
INSERT INTO medical_records (user_id, record_date, record_type, icon, doctor_name, facility, status, description) VALUES
    ('budi', '2024-01-30 09:15:00', 'Dental Cleaning',         'dentistry',  'Dr. Siska',          'Dental Wing, Room 105',    'completed', 'Regular dental cleaning and examination'),
    ('budi', '2024-01-10 11:00:00', 'Cardiology Consultation', 'ecg_heart',  'Dr. Tirta',          'Room 304, Main Building',  'completed', 'Routine heart health check — all clear');

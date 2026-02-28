-- Mediora — init.sql
-- Automatically run by PostgreSQL on first container start.

CREATE TABLE IF NOT EXISTS appointments (
    id               SERIAL PRIMARY KEY,
    user_id          VARCHAR(50)  NOT NULL,
    user_name        VARCHAR(100) NOT NULL,
    doctor           VARCHAR(100) NOT NULL,
    specialty        VARCHAR(100) NOT NULL,
    appointment_date TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '1 day',
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

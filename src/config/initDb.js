const db = require('./db');

const createTables = async () => {
    const schema = `
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            role VARCHAR(50) NOT NULL,
            name VARCHAR(255) NOT NULL,
            public_key TEXT,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS medications (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            patient_id UUID REFERENCES users(id),
            name VARCHAR(255) NOT NULL,
            total_inventory INT DEFAULT 0,
            refill_threshold INT DEFAULT 7
        );

        CREATE TABLE IF NOT EXISTS schedules (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            medication_id UUID REFERENCES medications(id) ON DELETE CASCADE,
            dosage_amount VARCHAR(100),
            time_of_day TIME NOT NULL,
            special_instructions TEXT
        );

        CREATE TABLE IF NOT EXISTS ai_warnings (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            patient_id UUID REFERENCES users(id),
            conflict_description TEXT NOT NULL,
            severity VARCHAR(50) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS dose_logs (
            id UUID PRIMARY KEY,
            schedule_id UUID REFERENCES schedules(id),
            patient_id UUID REFERENCES users(id),
            scheduled_time TIMESTAMPTZ NOT NULL,
            action_time TIMESTAMPTZ,
            status VARCHAR(50) NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    `;

    try {
        await db.query(schema);
        console.log("Tables created successfully!");
        process.exit(0);
    } catch (err) {
        console.error("Error creating tables:", err);
        process.exit(1);
    }
};

createTables();
// src/config/initDb.js - Database schema initialization with migration support
const db = require("./db");

const initDb = async () => {
  try {
    // First, check if we need to migrate the users table
    const tableCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'email'
    `);

    // If email column doesn't exist, we need to migrate
    if (tableCheck.rows.length === 0) {
      console.log("🔄 Migrating users table...");

      // Add missing columns to existing users table
      await db.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
      `);
      console.log("✅ Users table migrated");
    }

    // Create new tables if they don't exist
    const newTables = [
      // Doctor-Patient relationships
      `CREATE TABLE IF NOT EXISTS doctor_patients (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        doctor_id UUID REFERENCES users(id) ON DELETE CASCADE,
        patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(doctor_id, patient_id)
      )`,

      // Medications table
      `CREATE TABLE IF NOT EXISTS medications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        dosage VARCHAR(100),
        dosage_unit VARCHAR(50),
        instructions TEXT,
        total_inventory INT DEFAULT 0,
        refill_threshold INT DEFAULT 7,
        start_date DATE,
        end_date DATE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,

      // Schedules table
      `CREATE TABLE IF NOT EXISTS schedules (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        medication_id UUID REFERENCES medications(id) ON DELETE CASCADE,
        dosage_amount VARCHAR(100),
        time_of_day TIME NOT NULL,
        days_of_week INTEGER[] DEFAULT '{0,1,2,3,4,5,6}',
        special_instructions TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,

      // AI Planning Sessions
      `CREATE TABLE IF NOT EXISTS ai_plans (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
        input_text TEXT,
        extracted_text TEXT,
        ai_output JSONB,
        status VARCHAR(50) DEFAULT 'pending_approval',
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,

      // AI Plan Items
      `CREATE TABLE IF NOT EXISTS ai_plan_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        plan_id UUID REFERENCES ai_plans(id) ON DELETE CASCADE,
        medication_name VARCHAR(255),
        dosage VARCHAR(100),
        frequency VARCHAR(100),
        schedule_times TIME[],
        instructions TEXT,
        approved BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,

      // AI Warnings
      `CREATE TABLE IF NOT EXISTS ai_warnings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        plan_id UUID REFERENCES ai_plans(id) ON DELETE CASCADE,
        patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
        conflict_description TEXT NOT NULL,
        severity VARCHAR(50) NOT NULL,
        resolved BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,

      // AI Audit Logs
      `CREATE TABLE IF NOT EXISTS ai_audit_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
        action VARCHAR(100) NOT NULL,
        input_data JSONB,
        output_data JSONB,
        approved BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,

      // Dose Logs
      `CREATE TABLE IF NOT EXISTS dose_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        schedule_id UUID REFERENCES schedules(id) ON DELETE CASCADE,
        medication_id UUID REFERENCES medications(id) ON DELETE CASCADE,
        patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
        scheduled_time TIMESTAMPTZ NOT NULL,
        action_time TIMESTAMPTZ,
        status VARCHAR(50) NOT NULL,
        action_type VARCHAR(50),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,

      // Prescriptions
      `CREATE TABLE IF NOT EXISTS prescriptions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
        doctor_id UUID REFERENCES users(id),
        file_path TEXT,
        extracted_data JSONB,
        status VARCHAR(50) DEFAULT 'pending',
        confirmed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,

      // Chat Rooms
      `CREATE TABLE IF NOT EXISTS chat_rooms (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255),
        room_type VARCHAR(50) DEFAULT 'direct',
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,

      // Chat Room Members
      `CREATE TABLE IF NOT EXISTS chat_room_members (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(room_id, user_id)
      )`,

      // Messages
      `CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
        sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
        content TEXT,
        file_url TEXT,
        file_type VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,

      // Offline Logs
      `CREATE TABLE IF NOT EXISTS offline_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
        action VARCHAR(100) NOT NULL,
        data JSONB,
        timestamp TIMESTAMPTZ NOT NULL,
        synced BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
    ];

    for (const tableSQL of newTables) {
      await db.query(tableSQL);
    }

    // Create indexes
    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
      "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)",
      "CREATE INDEX IF NOT EXISTS idx_medications_patient ON medications(patient_id)",
      "CREATE INDEX IF NOT EXISTS idx_schedules_medication ON schedules(medication_id)",
      "CREATE INDEX IF NOT EXISTS idx_dose_logs_patient ON dose_logs(patient_id)",
      "CREATE INDEX IF NOT EXISTS idx_dose_logs_schedule ON dose_logs(schedule_id)",
      "CREATE INDEX IF NOT EXISTS idx_dose_logs_status ON dose_logs(status)",
      "CREATE INDEX IF NOT EXISTS idx_dose_logs_scheduled_time ON dose_logs(scheduled_time)",
      "CREATE INDEX IF NOT EXISTS idx_ai_plans_patient ON ai_plans(patient_id)",
      "CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id)",
    ];

    for (const indexSQL of indexes) {
      await db.query(indexSQL);
    }

    console.log("✅ Database schema verified/created");
  } catch (err) {
    console.error("❌ DB init failed:", err.message);
    // Don't exit in development
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  }
};

module.exports = initDb;

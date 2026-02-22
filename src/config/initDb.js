// src/config/initDb.js - Database schema initialization with migration support
const db = require("./db");

const initDb = async () => {
  try {
    // First, check if we need to migrate the users table
    const userColumns = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'email'
    `);

    // If email column doesn't exist, we need to migrate
    if (userColumns.rows.length === 0) {
      console.log("🔄 Migrating users table...");

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

    // Check and migrate ai_audit_logs
    const auditColumns = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'ai_audit_logs'
    `);

    const auditCols = auditColumns.rows.map((r) => r.column_name);

    if (!auditCols.includes("action")) {
      await db.query(
        `ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS action VARCHAR(100)`,
      );
      console.log("✅ ai_audit_logs - added action");
    }
    if (!auditCols.includes("input_data")) {
      await db.query(
        `ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS input_data JSONB`,
      );
      console.log("✅ ai_audit_logs - added input_data");
    }
    if (!auditCols.includes("output_data")) {
      await db.query(
        `ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS output_data JSONB`,
      );
      console.log("✅ ai_audit_logs - added output_data");
    }
    if (!auditCols.includes("approved")) {
      await db.query(
        `ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT false`,
      );
      console.log("✅ ai_audit_logs - added approved");
    }

    // Check and migrate dose_logs
    const doseColumns = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'dose_logs'
    `);

    const doseCols = doseColumns.rows.map((r) => r.column_name);

    if (!doseCols.includes("medication_id")) {
      await db.query(
        `ALTER TABLE dose_logs ADD COLUMN IF NOT EXISTS medication_id UUID`,
      );
      console.log("✅ dose_logs - added medication_id");
    }
    if (!doseCols.includes("action_type")) {
      await db.query(
        `ALTER TABLE dose_logs ADD COLUMN IF NOT EXISTS action_type VARCHAR(50)`,
      );
      console.log("✅ dose_logs - added action_type");
    }
    if (!doseCols.includes("notes")) {
      await db.query(
        `ALTER TABLE dose_logs ADD COLUMN IF NOT EXISTS notes TEXT`,
      );
      console.log("✅ dose_logs - added notes");
    }

    // Check and migrate medications
    const medColumns = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'medications'
    `);

    const medCols = medColumns.rows.map((r) => r.column_name);

    if (!medCols.includes("is_active")) {
      await db.query(
        `ALTER TABLE medications ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
      );
      console.log("✅ medications - added is_active");
    }
    if (!medCols.includes("dosage")) {
      await db.query(
        `ALTER TABLE medications ADD COLUMN IF NOT EXISTS dosage VARCHAR(100)`,
      );
      console.log("✅ medications - added dosage");
    }
    if (!medCols.includes("instructions")) {
      await db.query(
        `ALTER TABLE medications ADD COLUMN IF NOT EXISTS instructions TEXT`,
      );
      console.log("✅ medications - added instructions");
    }
    if (!medCols.includes("patient_id")) {
      await db.query(
        `ALTER TABLE medications ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES users(id)`,
      );
      console.log("✅ medications - added patient_id");
    }

    // Check and migrate schedules
    const schedColumns = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'schedules'
    `);

    const schedCols = schedColumns.rows.map((r) => r.column_name);

    if (!schedCols.includes("dosage_amount")) {
      await db.query(
        `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS dosage_amount VARCHAR(100)`,
      );
      console.log("✅ schedules - added dosage_amount");
    }
    if (!schedCols.includes("medication_id")) {
      await db.query(
        `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS medication_id UUID REFERENCES medications(id)`,
      );
      console.log("✅ schedules - added medication_id");
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
      try {
        await db.query(tableSQL);
      } catch (e) {
        // Table might already exist, ignore
      }
    }

    // Create indexes
    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
      "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)",
      "CREATE INDEX IF NOT EXISTS idx_medications_patient ON medications(patient_id)",
      "CREATE INDEX IF NOT EXISTS idx_medications_patient_active ON medications(patient_id, is_active)",
      "CREATE INDEX IF NOT EXISTS idx_schedules_medication ON schedules(medication_id)",
      "CREATE INDEX IF NOT EXISTS idx_schedules_time ON schedules(time_of_day)",
      "CREATE INDEX IF NOT EXISTS idx_dose_logs_patient ON dose_logs(patient_id)",
      "CREATE INDEX IF NOT EXISTS idx_dose_logs_schedule ON dose_logs(schedule_id)",
      "CREATE INDEX IF NOT EXISTS idx_dose_logs_status ON dose_logs(status)",
      "CREATE INDEX IF NOT EXISTS idx_dose_logs_scheduled_time ON dose_logs(scheduled_time)",
      "CREATE INDEX IF NOT EXISTS idx_dose_logs_schedule_patient_time ON dose_logs(schedule_id, patient_id, scheduled_time)",
      "CREATE INDEX IF NOT EXISTS idx_ai_plans_patient ON ai_plans(patient_id)",
      "CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id)",
    ];

    for (const indexSQL of indexes) {
      try {
        await db.query(indexSQL);
      } catch (e) {
        // Index might already exist, ignore
      }
    }

    console.log("✅ Database schema verified/created");
  } catch (err) {
    console.error("❌ DB init failed:", err.message);
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  }
};

module.exports = initDb;

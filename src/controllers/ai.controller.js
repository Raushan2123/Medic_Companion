const db = require("../config/db");
const { callAIScheduleService } = require("../services/ai.service");

const generateAISchedule = async (req, res) => {
  const { patientId, prompt } = req.body;

  try {
    const medsQuery = await db.query(
      "SELECT id, name FROM medications WHERE patient_id = $1",
      [patientId],
    );

    const currentMeds = medsQuery.rows;

    const aiData = await callAIScheduleService(currentMeds, prompt);

    await db.query("BEGIN");

    for (const sched of aiData.suggestedSchedules) {
      await db.query(
        `INSERT INTO schedules 
                 (medication_id, dosage_amount, time_of_day, special_instructions)
                 VALUES ($1, $2, $3, $4)`,
        [
          sched.medicationId,
          sched.dosageAmount,
          sched.timeOfDay,
          sched.specialInstructions,
        ],
      );
    }

    for (const warning of aiData.warnings) {
      await db.query(
        `INSERT INTO ai_warnings
                 (patient_id, conflict_description, severity)
                 VALUES ($1, $2, $3)`,
        [patientId, warning.conflictDescription, warning.severity],
      );
    }

    await db.query("COMMIT");

    res.json({ message: "Schedule applied securely", data: aiData });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "Failed to process AI schedule" });
  }
};

module.exports = { generateAISchedule };

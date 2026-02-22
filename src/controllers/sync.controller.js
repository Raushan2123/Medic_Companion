const db = require("../config/db");

const syncOfflineLogs = async (req, res) => {
  const { offlineLogs } = req.body;

  try {
    await db.query("BEGIN");

    for (const log of offlineLogs) {
      await db.query(
        `INSERT INTO offline_logs (patient_id, action, timestamp, synced)
         VALUES ($1, $2, $3, $4)`,
        [log.patientId, log.action, log.timestamp, true],
      );
    }

    await db.query("COMMIT");

    res.json({ message: "Offline logs synced successfully" });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "Failed to sync offline logs" });
  }
};

module.exports = { syncOfflineLogs };

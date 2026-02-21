// src/modules/adherence/adherence.controller.js - Adherence tracking controller
const db = require("../../config/db");

// Import adherence intelligence
const {
  computeAdherenceMetrics,
  classifyAdherenceRisk,
  generateNudgeFlags,
} = require("./adherence.intelligence");

// POST /adherence/mark - Mark dose as taken/missed/snoozed
const markDose = async (req, res) => {
  try {
    const { scheduleId, medicationId, status, notes, actionType } = req.body;
    const patientId = req.user.id;

    // Validate required fields
    if (!scheduleId || !medicationId || !status) {
      return res.status(400).json({
        error: "scheduleId, medicationId, and status are required",
      });
    }

    // Validate status
    const validStatuses = ["taken", "missed", "snoozed", "skipped"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // Get schedule details to determine scheduled time
    const scheduleResult = await db.query(
      "SELECT * FROM schedules WHERE id = $1 AND medication_id = $2",
      [scheduleId, medicationId],
    );

    if (scheduleResult.rows.length === 0) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    const schedule = scheduleResult.rows[0];

    // Calculate scheduled time (use current time for today's dose)
    const now = new Date();
    const [hours, minutes] = schedule.time_of_day.split(":");
    const scheduledTime = new Date(now);
    scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    // If the scheduled time has passed for today, use yesterday
    if (scheduledTime > now) {
      scheduledTime.setDate(scheduledTime.getDate() - 1);
    }

    // Check if there's an existing dose log for this schedule today
    const existingLog = await db.query(
      `SELECT * FROM dose_logs 
       WHERE schedule_id = $1 AND patient_id = $2 
       AND DATE(scheduled_time) = DATE(NOW())
       ORDER BY created_at DESC LIMIT 1`,
      [scheduleId, patientId],
    );

    let doseLog;

    if (existingLog.rows.length > 0) {
      // Update existing log
      const result = await db.query(
        `UPDATE dose_logs 
         SET status = $1, action_time = NOW(), notes = COALESCE($2, notes), action_type = $3
         WHERE id = $4
         RETURNING *`,
        [status, notes, actionType || status, existingLog.rows[0].id],
      );
      doseLog = result.rows[0];
    } else {
      // Create new dose log
      const result = await db.query(
        `INSERT INTO dose_logs (schedule_id, medication_id, patient_id, scheduled_time, action_time, status, action_type, notes)
         VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)
         RETURNING *`,
        [
          scheduleId,
          medicationId,
          patientId,
          scheduledTime,
          status,
          actionType || status,
          notes,
        ],
      );
      doseLog = result.rows[0];
    }

    // If marked as missed, trigger escalation check after delay
    if (status === "missed") {
      // The escalation will be handled by the reminder queue worker
      console.log(
        `Dose missed at ${scheduledTime}. Escalation will be triggered after delay.`,
      );
    }

    res.json({
      message: `Dose marked as ${status}`,
      doseLog: {
        id: doseLog.id,
        scheduleId: doseLog.schedule_id,
        medicationId: doseLog.medication_id,
        scheduledTime: doseLog.scheduled_time,
        actionTime: doseLog.action_time,
        status: doseLog.status,
        notes: doseLog.notes,
      },
    });
  } catch (error) {
    console.error("Mark dose error:", error);
    res.status(500).json({ error: "Failed to mark dose" });
  }
};

// GET /adherence/summary - Get adherence summary
const getAdherenceSummary = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { period = "7d" } = req.query;

    // Calculate date range based on period
    let startDate;
    const now = new Date();

    switch (period) {
      case "24h":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Convert period to windowDays for intelligence
    let windowDays = 7;
    switch (period) {
      case "24h":
        windowDays = 1;
        break;
      case "7d":
        windowDays = 7;
        break;
      case "30d":
        windowDays = 30;
        break;
    }

    // Get adherence stats
    const statsResult = await db.query(
      `SELECT 
         COUNT(*) as total_doses,
         SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken_doses,
         SUM(CASE WHEN status = 'missed' THEN 1 ELSE 0 END) as missed_doses,
         SUM(CASE WHEN status = 'snoozed' THEN 1 ELSE 0 END) as snoozed_doses,
         SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped_doses,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_doses
       FROM dose_logs 
       WHERE patient_id = $1 AND scheduled_time >= $2`,
      [patientId, startDate],
    );

    const stats = statsResult.rows[0];
    const totalDoses = parseInt(stats.total_doses) || 0;
    const takenDoses = parseInt(stats.taken_doses) || 0;

    // Calculate adherence percentage
    const adherenceRate =
      totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 0;

    // Get weekly trend (last 7 days)
    const trendResult = await db.query(
      `SELECT 
         DATE(scheduled_time) as date,
         COUNT(*) as total,
         SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken
       FROM dose_logs 
       WHERE patient_id = $1 AND scheduled_time >= $2
       GROUP BY DATE(scheduled_time)
       ORDER BY date DESC`,
      [patientId, startDate],
    );

    // Get medication-specific adherence
    const medAdherenceResult = await db.query(
      `SELECT 
         m.id as medication_id,
         m.name as medication_name,
         COUNT(*) as total_doses,
         SUM(CASE WHEN dl.status = 'taken' THEN 1 ELSE 0 END) as taken_doses
       FROM dose_logs dl
       JOIN medications m ON dl.medication_id = m.id
       WHERE dl.patient_id = $1 AND dl.scheduled_time >= $2
       GROUP BY m.id, m.name
       ORDER BY m.name`,
      [patientId, startDate],
    );

    // Get upcoming doses
    const upcomingResult = await db.query(
      `SELECT 
         s.id as schedule_id,
         m.name as medication_name,
         s.time_of_day,
         s.dosage_amount
       FROM schedules s
       JOIN medications m ON s.medication_id = m.id
       WHERE m.patient_id = $1 AND m.is_active = true
       ORDER BY s.time_of_day
       LIMIT 10`,
      [patientId],
    );

    // =============================================================================
    // TASK 2: Compute Adherence Intelligence
    // =============================================================================
    console.log(
      `[AdherenceSummary] Computing intelligence for patient ${patientId}`,
    );

    const metrics = await computeAdherenceMetrics({
      userId: patientId,
      windowDays,
    });

    const riskLevel = classifyAdherenceRisk(metrics.adherencePercentage);
    const nudgeFlags = generateNudgeFlags({
      adherencePercentage: metrics.adherencePercentage,
      missedStreak: metrics.missedStreak,
      lastMissedAt: metrics.lastMissedAt,
    });

    console.log(
      `[AdherenceSummary] Risk: ${riskLevel}, Adherence: ${metrics.adherencePercentage}%`,
    );

    // Build response (DO NOT BREAK OLD FIELDS - extend only)
    res.json({
      summary: {
        period,
        totalDoses,
        takenDoses,
        missedDoses: parseInt(stats.missed_doses) || 0,
        snoozedDoses: parseInt(stats.snoozed_doses) || 0,
        skippedDoses: parseInt(stats.skipped_doses) || 0,
        pendingDoses: parseInt(stats.pending_doses) || 0,
        adherenceRate,
      },
      // NEW: Intelligence fields (extended)
      adherencePercentage: metrics.adherencePercentage,
      riskLevel: riskLevel,
      missedStreak: metrics.missedStreak,
      lastMissedAt: metrics.lastMissedAt,
      lastTakenAt: metrics.lastTakenAt,
      nudgeFlags: nudgeFlags,
      weeklyTrend: trendResult.rows.map((day) => ({
        date: day.date,
        total: parseInt(day.total),
        taken: parseInt(day.taken),
        adherenceRate:
          day.total > 0 ? Math.round((day.taken / day.total) * 100) : 0,
      })),
      medicationAdherence: medAdherenceResult.rows.map((med) => ({
        medicationId: med.medication_id,
        medicationName: med.medication_name,
        totalDoses: parseInt(med.total_doses),
        takenDoses: parseInt(med.taken_doses),
        adherenceRate:
          med.total_doses > 0
            ? Math.round((med.taken_doses / med.total_doses) * 100)
            : 0,
      })),
      upcomingDoses: upcomingResult.rows.map((dose) => ({
        scheduleId: dose.schedule_id,
        medicationName: dose.medication_name,
        timeOfDay: dose.time_of_day,
        dosageAmount: dose.dosage_amount,
      })),
    });
  } catch (error) {
    console.error("Get adherence summary error:", error);
    res.status(500).json({ error: "Failed to get adherence summary" });
  }
};

// GET /adherence/history - Get dose history
const getDoseHistory = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    const result = await db.query(
      `SELECT 
         dl.id,
         dl.schedule_id,
         dl.medication_id,
         m.name as medication_name,
         s.dosage_amount,
         s.time_of_day,
         dl.scheduled_time,
         dl.action_time,
         dl.status,
         dl.notes,
         dl.created_at
       FROM dose_logs dl
       JOIN medications m ON dl.medication_id = m.id
       JOIN schedules s ON dl.schedule_id = s.id
       WHERE dl.patient_id = $1
       ORDER BY dl.scheduled_time DESC
       LIMIT $2 OFFSET $3`,
      [patientId, parseInt(limit), parseInt(offset)],
    );

    res.json({
      history: result.rows.map((log) => ({
        id: log.id,
        scheduleId: log.schedule_id,
        medicationId: log.medication_id,
        medicationName: log.medication_name,
        dosageAmount: log.dosage_amount,
        scheduledTime: log.scheduled_time,
        actionTime: log.action_time,
        status: log.status,
        notes: log.notes,
      })),
    });
  } catch (error) {
    console.error("Get dose history error:", error);
    res.status(500).json({ error: "Failed to get dose history" });
  }
};

module.exports = {
  markDose,
  getAdherenceSummary,
  getDoseHistory,
};

// ============================================================
// GIT INSTRUCTIONS AFTER COMPLETING ADHERENCE MODULE:
// ============================================================
// git add src/modules/adherence/
// git commit -m "feat: Add adherence tracking endpoints (/adherence/mark, /adherence/summary, /adherence/history)"
// git push origin phase1-architecture-refactor
// ============================================================

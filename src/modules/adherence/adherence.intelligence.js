/**
 * src/modules/adherence/adherence.intelligence.js
 *
 * Adherence Intelligence Layer
 * Computes adherence metrics, risk classification, and nudge flags
 * Deterministic, production-safe implementation
 */

const db = require("../../config/db");

// =============================================================================
// TASK 1: Adherence Intelligence Service
// =============================================================================

/**
 * Compute comprehensive adherence metrics for a patient
 * @param {Object} params
 * @param {string} params.userId - Patient ID
 * @param {number} params.windowDays - Lookback window in days (default 7)
 * @returns {Object} Adherence metrics
 */
async function computeAdherenceMetrics({ userId, windowDays = 7 }) {
  console.log(
    `[AdherenceIntelligence] Computing metrics for user ${userId}, window: ${windowDays}d`,
  );

  const startTime = Date.now();

  // Calculate start date
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - windowDays);
  startDate.setHours(0, 0, 0, 0);

  // Get all scheduled doses in window (from schedules that existed)
  const scheduledQuery = `
    SELECT 
      COUNT(DISTINCT CONCAT(s.id, DATE(scheduled_time))) as total_scheduled
    FROM schedules s
    JOIN medications m ON s.medication_id = m.id
    WHERE m.patient_id = $1 
      AND m.is_active = true
      AND scheduled_time >= $2
  `;

  // Get taken doses count
  const takenQuery = `
    SELECT COUNT(*) as total_taken
    FROM dose_logs
    WHERE patient_id = $1 
      AND status = 'taken'
      AND scheduled_time >= $2
  `;

  // Get missed doses count
  const missedQuery = `
    SELECT COUNT(*) as total_missed
    FROM dose_logs
    WHERE patient_id = $1 
      AND status = 'missed'
      AND scheduled_time >= $2
  `;

  // Get last taken timestamp
  const lastTakenQuery = `
    SELECT MAX(action_time) as last_taken_at
    FROM dose_logs
    WHERE patient_id = $1 
      AND status = 'taken'
      AND action_time >= $2
  `;

  // Get last missed timestamp
  const lastMissedQuery = `
    SELECT MAX(action_time) as last_missed_at
    FROM dose_logs
    WHERE patient_id = $1 
      AND status = 'missed'
      AND action_time >= $2
  `;

  // Execute queries in parallel
  const [
    scheduledResult,
    takenResult,
    missedResult,
    lastTakenResult,
    lastMissedResult,
  ] = await Promise.all([
    db.query(scheduledQuery, [userId, startDate]),
    db.query(takenQuery, [userId, startDate]),
    db.query(missedQuery, [userId, startDate]),
    db.query(lastTakenQuery, [userId, startDate]),
    db.query(lastMissedQuery, [userId, startDate]),
  ]);

  const totalScheduledDoses =
    parseInt(scheduledResult.rows[0]?.total_scheduled) || 0;
  const totalTakenDoses = parseInt(takenResult.rows[0]?.total_taken) || 0;
  const totalMissedDoses = parseInt(missedResult.rows[0]?.total_missed) || 0;

  // Calculate adherence percentage (0-100)
  const adherencePercentage =
    totalScheduledDoses > 0
      ? Math.round((totalTakenDoses / totalScheduledDoses) * 100)
      : 0;

  // Compute missed streak (consecutive missed from most recent backward)
  const missedStreak = await computeMissedStreak(userId, startDate);

  const lastTakenAt = lastTakenResult.rows[0]?.last_taken_at || null;
  const lastMissedAt = lastMissedResult.rows[0]?.last_missed_at || null;

  const duration = Date.now() - startTime;
  console.log(`[AdherenceIntelligence] Metrics computed in ${duration}ms`);

  return {
    totalScheduledDoses,
    totalTakenDoses,
    totalMissedDoses,
    adherencePercentage,
    missedStreak,
    lastMissedAt,
    lastTakenAt,
    windowDays,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Compute consecutive missed dose streak
 * Walks backward from most recent schedule time, counts missed doses
 * @param {string} userId - Patient ID
 * @param {Date} startDate - Window start
 * @returns {number} Consecutive missed count
 */
async function computeMissedStreak(userId, startDate) {
  // Get recent dose logs ordered by scheduled time descending
  const result = await db.query(
    `SELECT scheduled_time, status 
     FROM dose_logs 
     WHERE patient_id = $1 AND scheduled_time >= $2
     ORDER BY scheduled_time DESC
     LIMIT 50`,
    [userId, startDate],
  );

  if (result.rows.length === 0) {
    return 0;
  }

  let streak = 0;
  for (const log of result.rows) {
    if (log.status === "missed") {
      streak++;
    } else if (log.status === "taken") {
      // Found a taken dose, streak ends
      break;
    }
    // Skip other statuses (snoozed, skipped, pending)
  }

  return streak;
}

/**
 * Classify adherence risk based on percentage
 * @param {number} adherencePercentage - 0-100
 * @returns {string} Risk level: LOW | MEDIUM | HIGH
 */
function classifyAdherenceRisk(adherencePercentage) {
  // Defensive: handle invalid input
  if (adherencePercentage === null || adherencePercentage === undefined) {
    return "HIGH"; // Default to high risk if unknown
  }

  if (adherencePercentage >= 90) {
    return "LOW";
  } else if (adherencePercentage >= 70) {
    return "MEDIUM";
  } else {
    return "HIGH";
  }
}

/**
 * Generate nudge flags based on adherence data
 * @param {Object} params
 * @param {number} params.adherencePercentage - 0-100
 * @param {number} params.missedStreak - Consecutive missed count
 * @param {Date|null} params.lastMissedAt - Last missed timestamp
 * @returns {Object} Nudge flags
 */
function generateNudgeFlags({
  adherencePercentage,
  missedStreak,
  lastMissedAt,
}) {
  const flags = {
    highRisk: false,
    streakAlert: false,
    recentMiss: false,
  };

  // High risk: adherence < 70% OR missed streak >= 4
  if (
    (adherencePercentage !== null && adherencePercentage < 70) ||
    missedStreak >= 4
  ) {
    flags.highRisk = true;
  }

  // Streak alert: missed streak >= 2
  if (missedStreak >= 2) {
    flags.streakAlert = true;
  }

  // Recent miss: last missed within past 24 hours
  if (lastMissedAt) {
    const now = new Date();
    const lastMissed = new Date(lastMissedAt);
    const hoursSinceMiss = (now - lastMissed) / (1000 * 60 * 60);

    if (hoursSinceMiss <= 24) {
      flags.recentMiss = true;
    }
  }

  return flags;
}

/**
 * TASK 4: Check and suggest indexes for performance
 * Returns recommended indexes (non-destructive)
 */
function getRecommendedIndexes() {
  return [
    {
      name: "idx_dose_logs_patient_scheduled",
      sql: `CREATE INDEX IF NOT EXISTS idx_dose_logs_patient_scheduled 
            ON dose_logs(patient_id, scheduled_time DESC)`,
      reason: "Optimizes adherence queries by patient and time range",
    },
    {
      name: "idx_dose_logs_status",
      sql: `CREATE INDEX IF NOT EXISTS idx_dose_logs_status 
            ON dose_logs(patient_id, status, scheduled_time)`,
      reason: "Speeds up status-based filtering",
    },
    {
      name: "idx_schedules_medication_active",
      sql: `CREATE INDEX IF NOT EXISTS idx_schedules_medication_active 
            ON schedules(medication_id) WHERE is_active = true`,
      reason: "Quick active schedule lookups",
    },
  ];
}

// =============================================================================
// Export all functions
// =============================================================================

module.exports = {
  computeAdherenceMetrics,
  computeMissedStreak,
  classifyAdherenceRisk,
  generateNudgeFlags,
  getRecommendedIndexes,
};

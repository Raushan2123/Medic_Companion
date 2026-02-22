// src/modules/schedules/schedule.resolver.js - Dose Status Resolver
const db = require("../../config/db");

// Bucket order for sorting
const BUCKET_ORDER = {
  MORNING: 1,
  AFTERNOON: 2,
  NIGHT: 3,
};

/**
 * Determine bucket based on time of day
 * @param {string} timeOfDay - Time in HH:MM format
 * @returns {string} Bucket name
 */
function getBucket(timeOfDay) {
  if (!timeOfDay) return "MORNING";

  const hour = parseInt(timeOfDay.split(":")[0], 10);

  if (hour >= 5 && hour < 12) return "MORNING";
  if (hour >= 12 && hour < 17) return "AFTERNOON";
  return "NIGHT";
}

/**
 * Parse time string to Date object for the given date
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @param {string} timeStr - Time in HH:MM format
 * @param {string} timezone - IANA timezone string
 * @returns {Date} Combined date-time in the given timezone
 */
function parseLocalTime(dateStr, timeStr, timezone) {
  const [hours, minutes] = timeStr.split(":");
  // Create date in the specified timezone
  const date = new Date(`${dateStr}T${timeStr}:00`);

  // If timezone is provided, we need to handle it correctly
  // For simplicity, we'll assume the time is in the local timezone
  return date;
}

/**
 * Check if a dose is overdue
 * @param {Date} scheduledTime - The scheduled time
 * @param {number} graceMinutes - Grace period in minutes
 * @param {Date} now - Current time
 * @returns {boolean} Whether the dose is overdue
 */
function isOverdue(scheduledTime, graceMinutes, now) {
  if (!scheduledTime) return false;

  const graceEnd = new Date(scheduledTime.getTime() + graceMinutes * 60 * 1000);
  return now > graceEnd;
}

/**
 * Determine dose status based on dose_log
 * @param {Object} doseLog - The dose log entry (can be null)
 * @param {Date} scheduledTime - The scheduled time
 * @param {number} graceMinutes - Grace period in minutes
 * @param {Date} now - Current time
 * @returns {string} Status: PENDING | TAKEN | MISSED | SNOOZED
 */
function determineStatus(doseLog, scheduledTime, graceMinutes, now) {
  // Priority 1: If dose_log.action_type == "taken" → TAKEN
  if (doseLog?.action_type === "taken") {
    return "TAKEN";
  }

  // Priority 2: If dose_log.action_type == "snoozed" → SNOOZED
  if (doseLog?.action_type === "snoozed") {
    return "SNOOZED";
  }

  // Priority 3: If scheduled_time passed + grace → MISSED
  if (isOverdue(scheduledTime, graceMinutes, now)) {
    return "MISSED";
  }

  // Priority 4: else → PENDING
  return "PENDING";
}

/**
 * Resolve dose statuses for a given day
 * @param {Object} params - Parameters
 * @param {string} params.userId - User ID
 * @param {string} params.dateLocal - Date in YYYY-MM-DD format (local date)
 * @param {string} params.timezone - IANA timezone string
 * @param {number} params.graceMinutes - Grace period in minutes (default: 60)
 * @returns {Object} Resolved doses and metadata
 */
async function resolveDoseStatuses({
  userId,
  dateLocal,
  timezone,
  graceMinutes = 60,
}) {
  console.log(
    `[ScheduleResolver] Starting resolution for user ${userId} on ${dateLocal}`,
  );
  console.log(
    `[ScheduleResolver] Timezone: ${timezone}, Grace: ${graceMinutes}min`,
  );

  const startTime = Date.now();
  const now = new Date();

  try {
    // 1. Fetch all scheduled doses for the user on the given date
    // We need to get active medications with their schedules
    const schedulesQuery = `
      SELECT 
        s.id as schedule_id,
        s.medication_id,
        s.time_of_day,
        s.dosage_amount,
        m.name as medication_name,
        m.is_active
      FROM schedules s
      JOIN medications m ON s.medication_id = m.id
      WHERE m.patient_id = $1 
        AND m.is_active = true
      ORDER BY s.time_of_day ASC
    `;

    const schedulesResult = await db.query(schedulesQuery, [userId]);
    const schedules = schedulesResult.rows;

    console.log(
      `[ScheduleResolver] Found ${schedules.length} active schedules`,
    );

    if (schedules.length === 0) {
      return {
        doses: [],
        date: dateLocal,
        totalToday: 0,
        takenToday: 0,
        missedToday: 0,
        nextDoseAt: null,
        nextMedicationName: null,
      };
    }

    // 2. Batch fetch dose_logs for all schedules on the given date
    const scheduleIds = schedules.map((s) => s.schedule_id);

    // Build date range for the query
    const startOfDay = `${dateLocal}T00:00:00`;
    const endOfDay = `${dateLocal}T23:59:59`;

    const doseLogsQuery = `
      SELECT 
        dl.schedule_id,
        dl.action_type,
        dl.status,
        dl.scheduled_time,
        dl.action_time
      FROM dose_logs dl
      WHERE dl.schedule_id = ANY($1)
        AND dl.patient_id = $2
        AND dl.scheduled_time >= $3
        AND dl.scheduled_time <= $4
      ORDER BY dl.scheduled_time DESC
    `;

    const doseLogsResult = await db.query(doseLogsQuery, [
      scheduleIds,
      userId,
      startOfDay,
      endOfDay,
    ]);

    // Group dose logs by schedule_id (take the most recent one per schedule)
    const doseLogsMap = new Map();
    for (const log of doseLogsResult.rows) {
      if (!doseLogsMap.has(log.schedule_id)) {
        doseLogsMap.set(log.schedule_id, log);
      }
    }

    console.log(
      `[ScheduleResolver] Found ${doseLogsResult.rows.length} dose logs for today`,
    );

    // 3. Compute status for each dose
    const doses = [];
    let takenCount = 0;
    let missedCount = 0;

    for (const schedule of schedules) {
      // Calculate scheduled time for today
      const scheduledTime = parseLocalTime(
        dateLocal,
        schedule.time_of_day,
        timezone,
      );

      // Get dose log for this schedule
      const doseLog = doseLogsMap.get(schedule.schedule_id);

      // Determine status
      const status = determineStatus(doseLog, scheduledTime, graceMinutes, now);

      // Determine if overdue
      const doseIsOverdue =
        status === "PENDING" && isOverdue(scheduledTime, graceMinutes, now);

      // Increment counts
      if (status === "TAKEN") takenCount++;
      if (status === "MISSED") missedCount++;

      doses.push({
        doseId: schedule.schedule_id,
        medicationId: schedule.medication_id,
        medicationName: schedule.medication_name,
        timeLocal: schedule.time_of_day,
        bucket: getBucket(schedule.time_of_day),
        status,
        isOverdue: doseIsOverdue,
        scheduledTimeISO: scheduledTime.toISOString(),
      });
    }

    // 4. Sort doses by time and bucket
    doses.sort((a, b) => {
      // First sort by bucket order
      const bucketDiff = BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket];
      if (bucketDiff !== 0) return bucketDiff;

      // Then by time
      return a.timeLocal.localeCompare(b.timeLocal);
    });

    // 5. Compute next actionable dose (earliest future PENDING or SNOOZED)
    let nextDoseAt = null;
    let nextMedicationName = null;

    for (const dose of doses) {
      if (
        (dose.status === "PENDING" || dose.status === "SNOOZED") &&
        !dose.isOverdue
      ) {
        nextDoseAt = dose.scheduledTimeISO;
        nextMedicationName = dose.medicationName;
        break;
      }
    }

    // 6. Compute overdue summary
    const overdueCount = doses.filter((d) => d.isOverdue).length;

    console.log(
      `[ScheduleResolver] Resolved ${doses.length} doses in ${Date.now() - startTime}ms`,
    );
    console.log(
      `[ScheduleResolver] Status: ${takenCount} taken, ${missedCount} missed, ${overdueCount} overdue`,
    );

    // Return normalized structure (exclude internal scheduledTimeISO)
    return {
      date: dateLocal,
      doses: doses.map(({ scheduledTimeISO, ...rest }) => rest),
      nextDoseAt,
      nextMedicationName,
      totalToday: doses.length,
      takenToday: takenCount,
      missedToday: missedCount,
    };
  } catch (error) {
    console.error(`[ScheduleResolver] Error: ${error.message}`);
    // Return safe default on error
    return {
      date: dateLocal,
      doses: [],
      nextDoseAt: null,
      nextMedicationName: null,
      totalToday: 0,
      takenToday: 0,
      missedToday: 0,
    };
  }
}

/**
 * Get user timezone from database or default to UTC
 * @param {string} userId - User ID
 * @returns {Promise<string>} User's timezone
 */
async function getUserTimezone(userId) {
  try {
    const result = await db.query("SELECT timezone FROM users WHERE id = $1", [
      userId,
    ]);

    if (result.rows.length > 0 && result.rows[0].timezone) {
      return result.rows[0].timezone;
    }
  } catch (error) {
    console.error(
      `[ScheduleResolver] Error getting timezone: ${error.message}`,
    );
  }

  return "UTC";
}

module.exports = {
  resolveDoseStatuses,
  getUserTimezone,
  getBucket,
  isOverdue,
  determineStatus,
};

// src/modules/schedules/schedule.controller.js - Schedule controller
const { resolveDoseStatuses, getUserTimezone } = require("./schedule.resolver");

/**
 * GET /api/schedules/today - Get today's doses for the authenticated patient
 */
const getTodayDoses = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's timezone from request or database
    const timezone = req.user.timezone || (await getUserTimezone(userId));

    // Get today's date in the user's timezone
    const now = new Date();

    // Format date as YYYY-MM-DD in local time
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const dateLocal = `${year}-${month}-${day}`;

    console.log(
      `[ScheduleController] Getting today's doses for user ${userId}`,
    );

    // Call resolver
    const result = await resolveDoseStatuses({
      userId,
      dateLocal,
      timezone,
      graceMinutes: 60,
    });

    console.log(
      `[ScheduleController] Returning ${result.doses.length} doses for ${result.date}`,
    );

    // Return response with strict shape
    res.json({
      date: result.date,
      doses: result.doses,
      nextDoseAt: result.nextDoseAt,
      nextMedicationName: result.nextMedicationName,
      totalToday: result.totalToday,
      takenToday: result.takenToday,
      missedToday: result.missedToday,
    });
  } catch (error) {
    console.error("Get today's doses error:", error);
    res.status(500).json({ error: "Failed to get today's doses" });
  }
};

module.exports = {
  getTodayDoses,
};

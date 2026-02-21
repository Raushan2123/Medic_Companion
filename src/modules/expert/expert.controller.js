/**
 * src/modules/expert/expert.controller.js
 *
 * Expert Visibility Controller
 * Provides healthcare providers with patient adherence risk summaries
 * Fast, index-friendly queries for expert dashboard
 */

const db = require("../../config/db");
const {
  computeAdherenceMetrics,
  classifyAdherenceRisk,
  generateNudgeFlags,
} = require("../adherence/adherence.intelligence");

/**
 * GET /api/expert/patients/:patientId/adherence-risk
 *
 * Get patient adherence risk summary for expert/doctor/caregiver view
 * Requires expert role (doctor or caregiver)
 */
const getPatientAdherenceRisk = async (req, res) => {
  try {
    // Get expert's ID and role from authenticated request
    const expertId = req.user.id;
    const expertRole = req.user.role;
    const { patientId } = req.params;
    const { windowDays = 7 } = req.query;

    // Validate expert role
    if (!["doctor", "caregiver", "expert"].includes(expertRole)) {
      return res.status(403).json({
        error: "Access denied. Expert role required.",
      });
    }

    // Verify patient exists
    const patientResult = await db.query(
      "SELECT id, name, email FROM users WHERE id = $1 AND role = 'patient'",
      [patientId],
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({
        error: "Patient not found",
      });
    }

    const patient = patientResult.rows[0];

    // Compute adherence metrics
    console.log(
      `[ExpertView] Fetching risk for patient ${patientId} by expert ${expertId}`,
    );

    const metrics = await computeAdherenceMetrics({
      userId: patientId,
      windowDays: parseInt(windowDays) || 7,
    });

    // Classify risk
    const riskLevel = classifyAdherenceRisk(metrics.adherencePercentage);

    // Generate nudge flags
    const nudgeFlags = generateNudgeFlags({
      adherencePercentage: metrics.adherencePercentage,
      missedStreak: metrics.missedStreak,
      lastMissedAt: metrics.lastMissedAt,
    });

    // Determine most recent activity (either last taken or last missed)
    let lastActivityAt = null;
    if (metrics.lastTakenAt && metrics.lastMissedAt) {
      lastActivityAt =
        metrics.lastTakenAt > metrics.lastMissedAt
          ? metrics.lastTakenAt
          : metrics.lastMissedAt;
    } else if (metrics.lastTakenAt) {
      lastActivityAt = metrics.lastTakenAt;
    } else if (metrics.lastMissedAt) {
      lastActivityAt = metrics.lastMissedAt;
    }

    console.log(
      `[ExpertView] Patient ${patientId}: ${metrics.adherencePercentage}% adherence, risk: ${riskLevel}`,
    );

    // Return compact risk summary
    res.json({
      patientId: patient.id,
      patientName: patient.name, // Safe: patient name for caregiver context
      adherencePercentage: metrics.adherencePercentage,
      riskLevel: riskLevel,
      missedStreak: metrics.missedStreak,
      highRisk: nudgeFlags.highRisk,
      lastActivityAt: lastActivityAt,
      totalScheduled: metrics.totalScheduledDoses,
      totalTaken: metrics.totalTakenDoses,
      totalMissed: metrics.totalMissedDoses,
      windowDays: metrics.windowDays,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Expert adherence risk error:", error);
    res.status(500).json({ error: "Failed to get patient adherence risk" });
  }
};

/**
 * GET /api/expert/patients
 *
 * List patients assigned to this expert (for caregiver/doctor)
 */
const getAssignedPatients = async (req, res) => {
  try {
    const expertId = req.user.id;
    const expertRole = req.user.role;

    // Validate expert role
    if (!["doctor", "caregiver", "expert"].includes(expertRole)) {
      return res.status(403).json({
        error: "Access denied. Expert role required.",
      });
    }

    // Get patients assigned to this expert (via patient_caregivers or similar)
    // For now, get all patients (can be refined with proper assignment table)
    const patientsResult = await db.query(
      `SELECT 
        u.id, 
        u.name, 
        u.email,
        u.created_at as patient_since
       FROM users u 
       WHERE u.role = 'patient'
       ORDER BY u.name
       LIMIT 50`,
    );

    // Get quick summary for each patient (just count, not full metrics)
    const patients = await Promise.all(
      patientsResult.rows.map(async (patient) => {
        // Get recent adherence (last 7 days)
        const adherenceResult = await db.query(
          `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken
           FROM dose_logs
           WHERE patient_id = $1 
             AND scheduled_time >= NOW() - INTERVAL '7 days'`,
          [patient.id],
        );

        const total = parseInt(adherenceResult.rows[0]?.total) || 0;
        const taken = parseInt(adherenceResult.rows[0]?.taken) || 0;
        const adherence = total > 0 ? Math.round((taken / total) * 100) : null;

        return {
          id: patient.id,
          name: patient.name,
          patientSince: patient.patient_since,
          recentAdherence: adherence,
        };
      }),
    );

    res.json({
      patients: patients,
      count: patients.length,
    });
  } catch (error) {
    console.error("Get assigned patients error:", error);
    res.status(500).json({ error: "Failed to get patients" });
  }
};

module.exports = {
  getPatientAdherenceRisk,
  getAssignedPatients,
};

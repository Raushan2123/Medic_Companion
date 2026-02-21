// src/modules/ai/ai.controller.js - AI Planning controller
const db = require("../../config/db");
const { v4: uuidv4 } = require("uuid");

// Call AI service to generate plan
const callAIService = async (payload) => {
  const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

  try {
    const response = await fetch(`${AI_SERVICE_URL}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`AI service returned ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("AI service error:", error.message);
    // Return mock data for demo purposes if AI service unavailable
    return generateMockAIResponse(payload);
  }
};

// Helper function to parse medication names from text - simplified
const parseMedicationsFromText = (text) => {
  if (!text) return ["Medicine"];

  // Split by comma, semicolon, or "and"
  const parts = text
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter((p) => p);

  // For each part, try to extract the first word as medication name
  const medications = [];
  for (const part of parts) {
    // Remove common verbs and get first word
    const cleaned = part.replace(/^(take|have|use|prescribed)\s+/i, "").trim();

    // Get the first word (medication name)
    const firstWord = cleaned.split(/\s+/)[0];

    // Clean up - remove any trailing punctuation
    const medName = firstWord.replace(/[^a-zA-Z]/g, "");

    if (medName.length > 1) {
      medications.push(medName);
    }
  }

  return medications.length > 0 ? medications : ["Medicine"];
};

// Generate mock AI response for demo when service unavailable
const generateMockAIResponse = (payload) => {
  const { inputText, meds } = payload;

  // Parse medications from input or use provided meds
  let medications;
  if (inputText) {
    medications = parseMedicationsFromText(inputText);
  } else if (meds && meds.length > 0) {
    medications = meds.map((m) => m.name);
  } else {
    medications = ["Medicine"];
  }

  const scheduleTimes = ["08:00", "12:00", "18:00", "22:00"];

  return {
    suggestedSchedules: medications.map((med) => ({
      medicationName: med,
      dosage: "1 tablet",
      frequency: "4 times daily",
      scheduleTimes: scheduleTimes,
      instructions: `Take ${med} with water after meals.`,
    })),
    warnings: [],
    confidence: 0.85,
  };
};

// POST /ai/plan - Generate AI medication plan
const generatePlan = async (req, res) => {
  try {
    const { inputText, extractedText, meds } = req.body;
    const patientId = req.user.id;

    // Validate input
    if (!inputText && !extractedText && (!meds || meds.length === 0)) {
      return res.status(400).json({
        error: "Either inputText, extractedText, or meds array is required",
      });
    }

    // Call AI service
    const aiResponse = await callAIService({
      inputText,
      extractedText,
      meds,
      patientId,
    });

    // Create plan record in database
    const planResult = await db.query(
      `INSERT INTO ai_plans (patient_id, input_text, extracted_text, ai_output, status)
       VALUES ($1, $2, $3, $4, 'pending_approval')
       RETURNING id, status, created_at`,
      [patientId, inputText, extractedText, JSON.stringify(aiResponse)],
    );

    const plan = planResult.rows[0];

    // Insert AI plan items
    for (const item of aiResponse.suggestedSchedules || []) {
      await db.query(
        `INSERT INTO ai_plan_items (plan_id, medication_name, dosage, frequency, schedule_times, instructions)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          plan.id,
          item.medicationName,
          item.dosage,
          item.frequency,
          item.scheduleTimes,
          item.instructions,
        ],
      );
    }

    // Insert warnings if any
    for (const warning of aiResponse.warnings || []) {
      await db.query(
        `INSERT INTO ai_warnings (plan_id, patient_id, conflict_description, severity)
         VALUES ($1, $2, $3, $4)`,
        [plan.id, patientId, warning.conflictDescription, warning.severity],
      );
    }

    // Log the action
    await db.query(
      `INSERT INTO ai_audit_logs (patient_id, action, input_data, output_data)
       VALUES ($1, 'plan_generated', $2, $3)`,
      [
        patientId,
        JSON.stringify({ inputText, extractedText, meds }),
        JSON.stringify(aiResponse),
      ],
    );

    res.status(201).json({
      planId: plan.id,
      status: plan.status,
      suggestedSchedules: aiResponse.suggestedSchedules,
      warnings: aiResponse.warnings,
      confidence: aiResponse.confidence,
      message: "AI plan generated. Review and approve to apply.",
    });
  } catch (error) {
    console.error("Generate plan error:", error);
    res.status(500).json({ error: "Failed to generate AI plan" });
  }
};

// POST /ai/continue - Continue/refine AI plan
const continuePlan = async (req, res) => {
  try {
    const { planId, userPrompt, medsOverride, extractedText } = req.body;
    const patientId = req.user.id;

    // Validate required fields
    if (!planId || !userPrompt) {
      return res
        .status(400)
        .json({ error: "planId and userPrompt are required" });
    }

    // Get existing plan
    const planResult = await db.query(
      "SELECT * FROM ai_plans WHERE id = $1 AND patient_id = $2",
      [planId, patientId],
    );

    if (planResult.rows.length === 0) {
      return res.status(404).json({ error: "Plan not found" });
    }

    const existingPlan = planResult.rows[0];

    // Call AI service with continuation
    const aiResponse = await callAIService({
      continue: true,
      previousPlan: JSON.parse(existingPlan.ai_output),
      userPrompt,
      medsOverride,
      extractedText,
      patientId,
    });

    // Update plan with new AI output
    await db.query(
      `UPDATE ai_plans SET ai_output = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(aiResponse), planId],
    );

    // Update plan items
    await db.query("DELETE FROM ai_plan_items WHERE plan_id = $1", [planId]);

    for (const item of aiResponse.suggestedSchedules || []) {
      await db.query(
        `INSERT INTO ai_plan_items (plan_id, medication_name, dosage, frequency, schedule_times, instructions)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          planId,
          item.medicationName,
          item.dosage,
          item.frequency,
          item.scheduleTimes,
          item.instructions,
        ],
      );
    }

    // Log the action
    await db.query(
      `INSERT INTO ai_audit_logs (patient_id, action, input_data, output_data)
       VALUES ($1, 'plan_continued', $2, $3)`,
      [
        patientId,
        JSON.stringify({ planId, userPrompt }),
        JSON.stringify(aiResponse),
      ],
    );

    res.json({
      planId,
      suggestedSchedules: aiResponse.suggestedSchedules,
      warnings: aiResponse.warnings,
      message: "Plan updated based on your feedback.",
    });
  } catch (error) {
    console.error("Continue plan error:", error);
    res.status(500).json({ error: "Failed to continue AI plan" });
  }
};

// POST /ai/approve - Approve and apply AI plan
const approvePlan = async (req, res) => {
  try {
    const { planId, approvedItems, action = "approve" } = req.body;
    const patientId = req.user.id;

    if (!planId) {
      return res.status(400).json({ error: "planId is required" });
    }

    // Get plan details
    const planResult = await db.query(
      "SELECT * FROM ai_plans WHERE id = $1 AND patient_id = $2",
      [planId, patientId],
    );

    if (planResult.rows.length === 0) {
      return res.status(404).json({ error: "Plan not found" });
    }

    const plan = planResult.rows[0];

    // Get plan items
    const itemsResult = await db.query(
      "SELECT * FROM ai_plan_items WHERE plan_id = $1",
      [planId],
    );

    const itemsToApprove = approvedItems || itemsResult.rows;

    // Start transaction
    await db.query("BEGIN");

    // Update plan status
    await db.query(
      `UPDATE ai_plans SET status = 'approved', approved_at = NOW() WHERE id = $1`,
      [planId],
    );

    // Create medications and schedules from approved items
    const createdMeds = [];

    for (const item of itemsToApprove) {
      // Create medication
      const medResult = await db.query(
        `INSERT INTO medications (patient_id, name, dosage, instructions, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id, name, dosage`,
        [patientId, item.medication_name, item.dosage, item.instructions],
      );

      const medication = medResult.rows[0];
      createdMeds.push(medication);

      // Create schedules for each time
      const times = item.schedule_times || [];
      for (const time of times) {
        await db.query(
          `INSERT INTO schedules (medication_id, dosage_amount, time_of_day)
           VALUES ($1, $2, $3)`,
          [medication.id, item.dosage, time],
        );
      }

      // Mark item as approved
      await db.query("UPDATE ai_plan_items SET approved = true WHERE id = $1", [
        item.id,
      ]);
    }

    // Log approval action
    await db.query(
      `INSERT INTO ai_audit_logs (patient_id, action, input_data, output_data, approved)
       VALUES ($1, 'plan_approved', $2, $3, true)`,
      [
        patientId,
        JSON.stringify({ planId, approvedItems: itemsToApprove.length }),
        JSON.stringify(createdMeds),
      ],
    );

    await db.query("COMMIT");

    res.json({
      message: "Plan approved and applied successfully",
      planId,
      medicationsCreated: createdMeds.length,
      medications: createdMeds,
    });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("Approve plan error:", error);
    res.status(500).json({ error: "Failed to approve plan" });
  }
};

// GET /ai/audit - Get AI audit logs
const getAuditLogs = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { limit = 20 } = req.query;

    const result = await db.query(
      `SELECT id, action, input_data, output_data, approved, created_at
       FROM ai_audit_logs 
       WHERE patient_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [patientId, parseInt(limit)],
    );

    res.json({
      logs: result.rows.map((log) => ({
        id: log.id,
        action: log.action,
        inputData: log.input_data,
        outputData: log.output_data,
        approved: log.approved,
        createdAt: log.created_at,
      })),
    });
  } catch (error) {
    console.error("Get audit logs error:", error);
    res.status(500).json({ error: "Failed to get audit logs" });
  }
};

// GET /ai/debug_state - Debug AI state (for development)
const debugState = async (req, res) => {
  try {
    const patientId = req.user.id;

    // Get all plans
    const plansResult = await db.query(
      `SELECT id, status, ai_output, created_at, approved_at
       FROM ai_plans WHERE patient_id = $1
       ORDER BY created_at DESC LIMIT 10`,
      [patientId],
    );

    // Get all medications
    const medsResult = await db.query(
      `SELECT id, name, dosage, instructions, is_active, created_at
       FROM medications WHERE patient_id = $1
       ORDER BY created_at DESC`,
      [patientId],
    );

    // Get schedules
    const schedulesResult = await db.query(
      `SELECT s.id, s.dosage_amount, s.time_of_day, m.name as medication_name
       FROM schedules s
       JOIN medications m ON s.medication_id = m.id
       WHERE m.patient_id = $1
       ORDER BY s.time_of_day`,
      [patientId],
    );

    res.json({
      plans: plansResult.rows,
      medications: medsResult.rows,
      schedules: schedulesResult.rows,
    });
  } catch (error) {
    console.error("Debug state error:", error);
    res.status(500).json({ error: "Failed to get debug state" });
  }
};

module.exports = {
  generatePlan,
  continuePlan,
  approvePlan,
  getAuditLogs,
  debugState,
};

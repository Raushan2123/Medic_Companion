/**
 * src/utils/planner.js
 *
 * Medication Planning Utility with Frequency Guardrails
 *
 * Prevents LLM hallucination by adding deterministic frequency validation
 * and clarification prompts when frequency doesn't match input.
 */

// =============================================================================
// TASK 1: Frequency Inference Utility
// =============================================================================

// Frequency rules map regex patterns to expected daily dose count
// Supports common Indian prescription abbreviations and English
const _FREQ_RULES = [
  // Once daily patterns
  [
    /\b(once daily|od|1\s*\*\s*daily|one\s*time\s*daily|once\s*a\s*day|once\s*per\s*day)\b/i,
    1,
  ],
  [/\b(0-0-1|1-0-0|once)\b/i, 1],

  // Twice daily patterns
  [
    /\b(twice daily|bd|bid|2\s*\*\s*daily|two\s*times\s*daily|twice\s*a\s*day|two\s*times\s*a\s*day)\b/i,
    2,
  ],
  [/\b(1-0-1|0-1-1|1-1-0|bd)\b/i, 2],

  // Thrice daily patterns
  [
    /\b(thrice daily|tds|tid|3\s*\*\s*daily|three\s*times\s*daily|thrice\s*a\s*day)\b/i,
    3,
  ],
  [/\b(1-1-1|tid|tds)\b/i, 3],

  // Four times daily patterns
  [/\b(qid|4\s*\*\s*daily|four\s*times\s*daily|four\s*times\s*a\s*day)\b/i, 4],
  [/\b(1-1-1-1|qid)\b/i, 4],

  // Six times daily
  [/\b(6\s*\*\s*daily|six\s*times\s*daily|q6h|every\s*6\s*hours)\b/i, 6],

  // Every other day / weekly
  [/\b(eod|every\s*other\s*day|once\s*a\s*week|weekly|once\s*weekly)\b/i, 0.5], // Special case
];

/**
 * Infer expected daily frequency from medication text
 * @param {string} text - The medication text (e.g., "Take Aspirin 100mg once daily")
 * @returns {number|null} - Expected daily dose count, or null if unknown
 */
function inferExpectedFrequency(text) {
  if (!text || typeof text !== "string") {
    return null;
  }

  const lowerText = text.toLowerCase();

  for (const [pattern, frequency] of _FREQ_RULES) {
    if (pattern.test(lowerText)) {
      return frequency;
    }
  }

  return null;
}

/**
 * Extract frequency-related text from various input formats
 * @param {string|object} input - Raw text or medication object
 * @returns {string|null} - Frequency-related text
 */
function extractFrequencyText(input) {
  if (!input) return null;

  // If it's a string, return as-is for pattern matching
  if (typeof input === "string") {
    return input;
  }

  // If it's an object, look for frequency-related fields
  if (typeof input === "object") {
    // Check common field names
    const freqFields = [
      "frequency",
      "freq",
      "doseFrequency",
      "schedule",
      "instructions",
      "notes",
    ];
    for (const field of freqFields) {
      if (input[field] && typeof input[field] === "string") {
        return input[field];
      }
    }
  }

  return null;
}

// =============================================================================
// TASK 2: Dose Counting Helper
// =============================================================================

/**
 * Count reminders per medication from schedule
 * @param {Array} schedule - Array of schedule items
 * @returns {Object} - Object mapping medication names to reminder counts
 */
function countDoses(schedule) {
  const counts = {};

  if (!Array.isArray(schedule)) {
    return counts;
  }

  for (const item of schedule) {
    // Skip malformed entries
    if (!item || typeof item !== "object") {
      continue;
    }

    // Get medication name (case-insensitive key)
    const medName =
      item.medicationName || item.medication_name || item.name || "unknown";
    const key = medName.toLowerCase();

    // Count each schedule entry
    // A schedule item may have multiple times (array) or be single
    let itemCount = 0;

    const times = item.scheduleTimes || item.schedule_times || item.times || [];
    if (Array.isArray(times)) {
      itemCount = times.length;
    } else if (times) {
      // Single time value counts as 1
      itemCount = 1;
    }

    // Also count if there's a frequency string - but we use actual times for accuracy
    if (itemCount === 0) {
      // Fallback: if no times but has frequency, estimate from frequency
      const freq = item.frequency || item.freq || "";
      if (/\bonce\b/i.test(freq)) itemCount = 1;
      else if (/\btwice\b|\bbd\b|\bbid\b/i.test(freq)) itemCount = 2;
      else if (/\bthrice\b|\btds\b|\btid\b/i.test(freq)) itemCount = 3;
      else if (/\bqid\b|\bfour\b/i.test(freq)) itemCount = 4;
      else itemCount = 1; // Default assumption
    }

    counts[key] = (counts[key] || 0) + itemCount;
  }

  return counts;
}

// =============================================================================
// TASK 3: Frequency Sanity Guard
// =============================================================================

/**
 * Validate schedule against expected frequencies and add clarification if needed
 * @param {Object} params - Parameters object
 * @param {string|Array} params.inputText - Original input text or array of meds
 * @param {Array} params.schedule - Generated schedule from LLM
 * @returns {Object} - Updated schedule with needs_info and clarification_questions
 */
function validateFrequencyGuardrails({ inputText, schedule }) {
  // Initialize result with original values
  const result = {
    schedule: schedule || [],
    needsInfo: false,
    clarificationQuestions: [],
    frequencyMismatches: [],
  };

  // Get the original input text to analyze
  let fullText = "";

  if (typeof inputText === "string") {
    fullText = inputText;
  } else if (Array.isArray(inputText)) {
    // If input is array of meds, combine all frequency info
    fullText = inputText
      .map(
        (m) => `${m.name || ""} ${m.frequency || ""} ${m.instructions || ""}`,
      )
      .join(" ");
  } else if (inputText && typeof inputText === "object") {
    // Single med object
    fullText = `${inputText.name || ""} ${inputText.frequency || ""} ${inputText.instructions || ""}`;
  }

  // If no schedule or no input text, skip validation
  if (!result.schedule.length || !fullText) {
    return result;
  }

  // Infer expected frequency from input
  const expectedFreq = inferExpectedFrequency(fullText);

  if (expectedFreq === null) {
    // Unknown frequency - mark for clarification
    result.needsInfo = true;
    result.clarificationQuestions.push({
      question:
        "Frequency was not clearly specified in the input. Please confirm how many times per day this medication should be taken.",
      field: "frequency",
    });
    return result;
  }

  // Count actual reminders in schedule
  const doseCounts = countDoses(result.schedule);

  // Check each medication for frequency mismatch
  for (const [medKey, actualCount] of Object.entries(doseCounts)) {
    // Get original medication name for display
    const medItem = result.schedule.find((item) => {
      const itemName = (
        item.medicationName ||
        item.medication_name ||
        item.name ||
        ""
      ).toLowerCase();
      return itemName === medKey;
    });

    const medName =
      medItem?.medicationName || medItem?.medication_name || medKey;

    // Special case: weekly (0.5 frequency) - should be 1 reminder but less frequent
    const effectiveExpected = expectedFreq === 0.5 ? 1 : expectedFreq;

    if (actualCount > effectiveExpected) {
      // OVERSCHEDULING DETECTED - This is clinically unsafe!
      result.frequencyMismatches.push({
        medication: medName,
        expected: effectiveExpected,
        actual: actualCount,
        severity: "high",
      });

      result.needsInfo = true;

      // Create clarification question (avoid duplicates)
      const questionText = `I detected ${actualCount} reminders for ${medName}, but input suggests ${effectiveExpected} per day. Please confirm frequency.`;

      const existingQuestion = result.clarificationQuestions.find((q) =>
        q.question.includes(medName),
      );

      if (!existingQuestion) {
        result.clarificationQuestions.push({
          question: questionText,
          medication: medName,
          expectedFrequency: effectiveExpected,
          actualFrequency: actualCount,
          field: "frequency",
        });
      }

      // LOG: Record the mismatch event (non-PHI)
      console.log(
        `[FrequencyGuard] Mismatch detected: ${medName} - expected ${effectiveExpected}, got ${actualCount}`,
      );
    }
  }

  return result;
}

// =============================================================================
// TASK 4: Safe Fallback Behavior
// =============================================================================

/**
 * Apply safe fallback behavior when schedule is empty or invalid
 * @param {Object} params - Parameters
 * @returns {Object} - Safe fallback result
 */
function applySafeFallback({ inputText, meds }) {
  // If we have medications but no valid schedule, ask for clarification
  const hasMeds =
    (Array.isArray(meds) && meds.length > 0) ||
    (inputText && typeof inputText === "string" && inputText.length > 0);

  if (hasMeds) {
    return {
      schedule: [],
      needsInfo: true,
      clarificationQuestions: [
        {
          question:
            "Could not generate a valid schedule. Please confirm the frequency (how many times per day) for each medication.",
          field: "frequency",
        },
      ],
      fallback: true,
    };
  }

  // No medications at all
  return {
    schedule: [],
    needsInfo: true,
    clarificationQuestions: [
      {
        question:
          "No medication information provided. Please enter medication name, dosage, and frequency.",
        field: "medications",
      },
    ],
    fallback: true,
  };
}

// =============================================================================
// TASK 5: SYSTEM Prompt Strengthener
// =============================================================================

/**
 * Get strengthened system prompt to reduce hallucination
 * @returns {string} - Enhanced system prompt
 */
function getStrengthenedSystemPrompt() {
  return `You are a medication planning assistant. Your role is to help patients manage their medications safely.

CRITICAL SAFETY RULES:
1. NEVER invent a frequency. Use ONLY what the user explicitly states.
2. NEVER exceed the frequency stated by the user.
3. If frequency is unclear, set needs_info=true and ask for clarification.
4. For "once daily" medications, ALWAYS default to MORNING (e.g., 08:00).
5. For "twice daily", use MORNING and EVENING (e.g., 08:00, 18:00).
6. For "three times daily", use MORNING, AFTERNOON, EVENING (e.g., 08:00, 14:00, 20:00).
7. For "four times daily", distribute evenly (e.g., 08:00, 12:00, 16:00, 20:00).

OUTPUT FORMAT (JSON):
{
  "suggestedSchedules": [
    {
      "medicationName": "string",
      "dosage": "string", 
      "frequency": "string (exactly as stated by user)",
      "scheduleTimes": ["HH:MM format"],
      "instructions": "string"
    }
  ],
  "warnings": [],
  "needs_info": boolean,
  "clarification_questions": [
    {
      "question": "string",
      "field": "string"
    }
  ]
}

Remember: Patient safety is paramount. When in doubt, ask rather than guess.`;
}

/**
 * Get original/system prompt (for backward compatibility)
 * @returns {string} - Original prompt
 */
function getOriginalSystemPrompt() {
  return `You are a medication planning assistant. Create safe medication schedules based on user input.

Output JSON with suggestedSchedules, warnings, and confidence score.`;
}

// =============================================================================
// TASK 6: Input Contract Handler
// =============================================================================

/**
 * Normalize input from various formats (raw_text or structured meds)
 * @param {Object} input - Request body
 * @returns {Object} - Normalized input with rawText and meds
 */
function normalizeInputContract(input) {
  const result = {
    rawText: null,
    meds: [],
    combinedText: "",
  };

  if (!input) return result;

  // Mode A: raw_text field
  if (input.raw_text) {
    result.rawText = input.raw_text;
    result.combinedText += input.raw_text + " ";
  }

  // Also check inputText (backward compatibility)
  if (input.inputText) {
    if (!result.rawText) {
      result.rawText = input.inputText;
    }
    result.combinedText += input.inputText + " ";
  }

  // Also check extractedText (backward compatibility)
  if (input.extractedText) {
    result.combinedText += input.extractedText + " ";
  }

  // Mode B: structured meds array
  if (Array.isArray(input.meds)) {
    result.meds = input.meds;

    // Add medication details to combined text for frequency inference
    for (const med of input.meds) {
      const medStr = `${med.name || ""} ${med.frequency || ""} ${med.dosage || ""} ${med.instructions || ""}`;
      result.combinedText += medStr + " ";
    }
  }

  result.combinedText = result.combinedText.trim();

  return result;
}

// =============================================================================
// TASK 7: Debug Logging
// =============================================================================

/**
 * Log frequency detection and validation events (non-PHI)
 * @param {string} event - Event type
 * @param {Object} data - Event data (no PHI)
 */
function logFrequencyEvent(event, data) {
  const timestamp = new Date().toISOString();
  const safeData = {
    ...data,
    // Ensure no PHI in logs
    hasInputLength: data.inputLength || 0,
    detectedFrequency: data.detectedFrequency,
    reminderCount: data.reminderCount,
    mismatch: data.mismatch || false,
  };

  console.log(
    `[FrequencyGuard] ${timestamp} - ${event}:`,
    JSON.stringify(safeData),
  );
}

// =============================================================================
// TASK 8: Main Planner Function (llm_build_plan equivalent)
// =============================================================================

/**
 * Build medication plan with frequency guardrails
 * This is the main entry point that wraps LLM output with safety checks
 *
 * @param {Object} params - Planning parameters
 * @param {string|Array|Object} params.input - Input text or meds array
 * @param {Array} params.llmSchedule - Schedule from LLM (may be null if LLM unavailable)
 * @param {boolean} params.useMockData - Use mock data when LLM unavailable
 * @returns {Object} - Safe plan with validation
 */
async function llmBuildPlan({ input, llmSchedule, useMockData = false }) {
  // Normalize input
  const normalized = normalizeInputContract(input);

  // If no LLM schedule and mock is allowed, generate basic mock
  let schedule = llmSchedule;

  if (!schedule && useMockData) {
    // Generate minimal mock schedule - this will trigger validation
    schedule = normalized.meds.map((med) => ({
      medicationName: med.name || "Medication",
      dosage: med.dosage || "1 tablet",
      frequency: med.frequency || "once daily",
      scheduleTimes: ["08:00"],
      instructions: med.instructions || "Take with water",
    }));
  }

  // Apply frequency guardrails
  const validated = validateFrequencyGuardrails({
    inputText: normalized.combinedText || normalized.rawText,
    schedule: schedule || [],
  });

  // If schedule is empty after validation, apply safe fallback
  if (
    !validated.schedule.length &&
    (normalized.rawText || normalized.meds.length)
  ) {
    const fallback = applySafeFallback({
      inputText: normalized.combinedText,
      meds: normalized.meds,
    });

    return {
      suggestedSchedules: fallback.schedule,
      needsInfo: fallback.needsInfo,
      clarificationQuestions: fallback.clarificationQuestions,
      warnings: [],
      validated: true,
      fallback: true,
    };
  }

  // Log validation results
  logFrequencyEvent("Plan Validated", {
    inputLength: normalized.combinedText.length,
    detectedFrequency: inferExpectedFrequency(normalized.combinedText),
    reminderCount: Object.values(countDoses(validated.schedule)).reduce(
      (a, b) => a + b,
      0,
    ),
    mismatch: validated.frequencyMismatches.length > 0,
  });

  return {
    suggestedSchedules: validated.schedule,
    needsInfo: validated.needsInfo,
    clarificationQuestions: validated.clarificationQuestions,
    warnings: validated.frequencyMismatches.map((m) => ({
      conflictDescription: `${m.medication}: Expected ${m.expected} doses/day, got ${m.actual}`,
      severity: m.severity,
    })),
    validated: true,
    frequencyMismatches: validated.frequencyMismatches,
  };
}

// =============================================================================
// Export all functions
// =============================================================================

module.exports = {
  // Core functions
  inferExpectedFrequency,
  extractFrequencyText,
  countDoses,
  validateFrequencyGuardrails,
  applySafeFallback,
  normalizeInputContract,
  llmBuildPlan,

  // Prompt functions
  getStrengthenedSystemPrompt,
  getOriginalSystemPrompt,

  // Logging
  logFrequencyEvent,

  // Constants (for testing)
  FREQ_RULES: _FREQ_RULES,
};

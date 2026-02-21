/**
 * tests/planner.test.js
 *
 * Unit tests for frequency guardrail planner
 * Tests TASK 8 requirements: frequency validation and safety guardrails
 * Uses Node.js native test runner
 */

const {
  inferExpectedFrequency,
  countDoses,
  validateFrequencyGuardrails,
  applySafeFallback,
  normalizeInputContract,
  llmBuildPlan,
  getStrengthenedSystemPrompt,
} = require("../src/utils/planner");

// =============================================================================
// TASK 1: Frequency Inference Utility Tests
// =============================================================================

console.log("\n=== TASK 1: Frequency Inference Utility Tests ===\n");

// Test once daily → returns 1
{
  const result = inferExpectedFrequency("Take Aspirin 100mg once daily");
  console.log(
    `once daily → ${result === 1 ? "✓ PASS" : "✗ FAIL"} (expected 1, got ${result})`,
  );
}

// Test OD → returns 1
{
  const result = inferExpectedFrequency("Tab Metformin 500mg OD");
  console.log(
    `OD → ${result === 1 ? "✓ PASS" : "✗ FAIL"} (expected 1, got ${result})`,
  );
}

// Test twice daily → returns 2
{
  const result = inferExpectedFrequency("Take Medicine twice daily");
  console.log(
    `twice daily → ${result === 2 ? "✓ PASS" : "✗ FAIL"} (expected 2, got ${result})`,
  );
}

// Test BD → returns 2
{
  const result = inferExpectedFrequency("Tab Amoxicillin BD");
  console.log(
    `BD → ${result === 2 ? "✓ PASS" : "✗ FAIL"} (expected 2, got ${result})`,
  );
}

// Test thrice daily → returns 3
{
  const result = inferExpectedFrequency("Take Medicine thrice daily");
  console.log(
    `thrice daily → ${result === 3 ? "✓ PASS" : "✗ FAIL"} (expected 3, got ${result})`,
  );
}

// Test TDS → returns 3
{
  const result = inferExpectedFrequency("Tab Cetrizine TDS");
  console.log(
    `TDS → ${result === 3 ? "✓ PASS" : "✗ FAIL"} (expected 3, got ${result})`,
  );
}

// Test QID → returns 4
{
  const result = inferExpectedFrequency("Medicine QID");
  console.log(
    `QID → ${result === 4 ? "✓ PASS" : "✗ FAIL"} (expected 4, got ${result})`,
  );
}

// Test unknown frequency → returns null
{
  const result = inferExpectedFrequency("Take Medicine");
  console.log(
    `unknown → ${result === null ? "✓ PASS" : "✗ FAIL"} (expected null, got ${result})`,
  );
}

// Test case insensitivity
{
  const r1 = inferExpectedFrequency("ONCE DAILY");
  const r2 = inferExpectedFrequency("Twice Daily");
  console.log(
    `case insensitive → ${r1 === 1 && r2 === 2 ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// =============================================================================
// TASK 2: Dose Counting Helper Tests
// =============================================================================

console.log("\n=== TASK 2: Dose Counting Helper Tests ===\n");

// Test counts reminders per medication
{
  const schedule = [
    { medicationName: "Aspirin", scheduleTimes: ["08:00", "20:00"] },
    { medicationName: "Metformin", scheduleTimes: ["08:00"] },
  ];
  const counts = countDoses(schedule);
  console.log(
    `counts reminders → ${counts.aspirin === 2 && counts.metformin === 1 ? "✓ PASS" : "✗ FAIL"} (aspirin=${counts.aspirin}, metformin=${counts.metformin})`,
  );
}

// Test handles snake_case field names
{
  const schedule = [
    { medication_name: "Aspirin", schedule_times: ["08:00", "20:00"] },
  ];
  const counts = countDoses(schedule);
  console.log(
    `snake_case fields → ${counts.aspirin === 2 ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// Test handles empty schedule
{
  const result = countDoses([]);
  console.log(
    `empty schedule → ${JSON.stringify(result) === "{}" ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// Test skips malformed entries
{
  const schedule = [
    { medicationName: "Aspirin", scheduleTimes: ["08:00"] },
    null,
    "invalid",
  ];
  const counts = countDoses(schedule);
  console.log(
    `skips malformed → ${counts.aspirin === 1 ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// =============================================================================
// TASK 3: Frequency Sanity Guard Tests
// =============================================================================

console.log("\n=== TASK 3: Frequency Sanity Guard Tests ===\n");

// Test once daily input → max 1 reminder allowed (valid)
{
  const inputText = "Take Aspirin 100mg once daily";
  const schedule = [{ medicationName: "Aspirin", scheduleTimes: ["08:00"] }];
  const result = validateFrequencyGuardrails({ inputText, schedule });
  console.log(`once daily with 1 → ${!result.needsInfo ? "✓ PASS" : "✗ FAIL"}`);
}

// CRITICAL: once daily input with 4 reminders → DETECTS OVERSCHEDULING
{
  const inputText = "Take Aspirin 100mg once daily";
  const schedule = [
    {
      medicationName: "Aspirin",
      scheduleTimes: ["08:00", "12:00", "18:00", "22:00"],
    },
  ];
  const result = validateFrequencyGuardrails({ inputText, schedule });
  const passed =
    result.needsInfo === true &&
    result.frequencyMismatches.length === 1 &&
    result.frequencyMismatches[0].expected === 1 &&
    result.frequencyMismatches[0].actual === 4;
  console.log(
    `once daily with 4 → ${passed ? "✓ PASS (OVERSCHEDULING DETECTED!)" : "✗ FAIL"}`,
  );
  if (passed) {
    console.log(
      `  → Clarification: "${result.clarificationQuestions[0].question}"`,
    );
  }
}

// Test BD input with 2 reminders → OK
{
  const inputText = "Take Medicine BD";
  const schedule = [
    { medicationName: "Medicine", scheduleTimes: ["08:00", "20:00"] },
  ];
  const result = validateFrequencyGuardrails({ inputText, schedule });
  console.log(`BD with 2 → ${!result.needsInfo ? "✓ PASS" : "✗ FAIL"}`);
}

// Test BD input with 4 reminders → DETECTS OVERSCHEDULING
{
  const inputText = "Take Medicine BD";
  const schedule = [
    {
      medicationName: "Medicine",
      scheduleTimes: ["08:00", "12:00", "18:00", "22:00"],
    },
  ];
  const result = validateFrequencyGuardrails({ inputText, schedule });
  console.log(
    `BD with 4 → ${result.needsInfo && result.frequencyMismatches[0].expected === 2 ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// Test unknown frequency → sets needsInfo
{
  const inputText = "Take Medicine";
  const schedule = [{ medicationName: "Medicine", scheduleTimes: ["08:00"] }];
  const result = validateFrequencyGuardrails({ inputText, schedule });
  console.log(`unknown freq → ${result.needsInfo ? "✓ PASS" : "✗ FAIL"}`);
}

// =============================================================================
// TASK 4: Safe Fallback Behavior Tests
// =============================================================================

console.log("\n=== TASK 4: Safe Fallback Behavior Tests ===\n");

// Test has meds but no schedule → asks for clarification
{
  const result = applySafeFallback({
    inputText: "Take Medicine",
    meds: [{ name: "Aspirin" }],
  });
  console.log(
    `has meds, no schedule → ${result.needsInfo && result.fallback ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// Test no meds → asks for medication info
{
  const result = applySafeFallback({
    inputText: "",
    meds: [],
  });
  console.log(
    `no meds → ${result.needsInfo && result.clarificationQuestions[0].field === "medications" ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// =============================================================================
// TASK 6: Input Contract Handler Tests
// =============================================================================

console.log("\n=== TASK 6: Input Contract Handler Tests ===\n");

// Test Mode A: raw_text input
{
  const input = { raw_text: "Take Medicine once daily" };
  const result = normalizeInputContract(input);
  console.log(
    `raw_text mode → ${result.rawText === "Take Medicine once daily" ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// Test Mode B: structured meds
{
  const input = {
    meds: [{ name: "Aspirin", frequency: "once daily", dosage: "100mg" }],
  };
  const result = normalizeInputContract(input);
  console.log(
    `structured meds → ${result.meds.length === 1 ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// Test backward compatibility
{
  const input = { inputText: "Take Medicine" };
  const result = normalizeInputContract(input);
  console.log(
    `backward compat → ${result.rawText === "Take Medicine" ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// =============================================================================
// TASK 5: SYSTEM Prompt Strengthener Tests
// =============================================================================

console.log("\n=== TASK 5: SYSTEM Prompt Strengthener Tests ===\n");

{
  const prompt = getStrengthenedSystemPrompt();
  const hasSafetyRules = prompt.includes("CRITICAL SAFETY RULES");
  const hasNeverInvent = prompt.includes("NEVER invent a frequency");
  const hasNeedsInfo = prompt.includes("needs_info");
  const hasMorning = prompt.includes("MORNING");
  console.log(
    `strengthened prompt → ${hasSafetyRules && hasNeverInvent && hasNeedsInfo && hasMorning ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// =============================================================================
// TASK 8: Main Planner Function Tests
// =============================================================================

console.log("\n=== TASK 8: Main Planner Function Tests ===\n");

// Test validates schedule and detects overscheduling
{
  const input = { raw_text: "Take Aspirin once daily" };
  const llmSchedule = [
    {
      medicationName: "Aspirin",
      scheduleTimes: ["08:00", "12:00", "18:00", "22:00"],
    },
  ];

  llmBuildPlan({ input, llmSchedule }).then((result) => {
    const passed =
      result.validated === true &&
      result.needsInfo === true &&
      result.frequencyMismatches.length === 1;
    console.log(`detects overscheduling → ${passed ? "✓ PASS" : "✗ FAIL"}`);
  });
}

// Test returns safe schedule when valid
{
  const input = { raw_text: "Take Aspirin once daily" };
  const llmSchedule = [{ medicationName: "Aspirin", scheduleTimes: ["08:00"] }];

  llmBuildPlan({ input, llmSchedule }).then((result) => {
    const passed =
      result.validated === true &&
      result.needsInfo === false &&
      result.frequencyMismatches.length === 0;
    console.log(`valid schedule → ${passed ? "✓ PASS" : "✗ FAIL"}`);
  });
}

// =============================================================================
// CRITICAL: Original Problem Reproduction Test
// =============================================================================

console.log("\n=== CRITICAL: Original Problem Reproduction Test ===\n");

// This is the exact bug scenario from the task
const criticalInput = { raw_text: "Take Aspirin 100mg once daily" };
const hallucinatedSchedule = [
  {
    medicationName: "Aspirin",
    scheduleTimes: ["08:00", "12:00", "18:00", "22:00"],
  },
];

llmBuildPlan({ input: criticalInput, llmSchedule: hallucinatedSchedule }).then(
  (result) => {
    // The guardrails MUST catch this
    const passed =
      result.needsInfo === true &&
      result.frequencyMismatches[0].medication === "Aspirin" &&
      result.frequencyMismatches[0].expected === 1 &&
      result.frequencyMismatches[0].actual === 4;

    console.log(
      `once daily → 4 reminders: ${passed ? "✓ PASS (GUARDRAILS WORK!)" : "✗ FAIL"}`,
    );

    if (passed) {
      console.log(
        "\n  ✓ Frequency guardrails successfully prevent silent over-scheduling!",
      );
      console.log(
        `  ✓ Clarification question: "${result.clarificationQuestions[0].question}"`,
      );
    }

    console.log("\n=== All Tests Complete ===\n");
  },
);

/**
 * tests/schedule.resolver.test.js
 *
 * Unit tests for schedule.resolver.js - Dose Status Resolver
 * Tests TASK 8 requirements: pending, taken, snoozed, missed, overdue, nextDoseAt
 * Uses Node.js native test runner
 */

// Import the functions we want to test (we'll test them synchronously first)
const {
  getBucket,
  isOverdue,
  determineStatus,
} = require("../src/modules/schedules/schedule.resolver");

// =============================================================================
// TASK 1: getBucket Tests
// =============================================================================

console.log("\n=== TASK 1: getBucket Tests ===\n");

// Test MORNING bucket (5am - 11:59am)
{
  const result = getBucket("08:00");
  console.log(`08:00 → MORNING: ${result === "MORNING" ? "✓ PASS" : "✗ FAIL"}`);
}

{
  const result = getBucket("05:00");
  console.log(`05:00 → MORNING: ${result === "MORNING" ? "✓ PASS" : "✗ FAIL"}`);
}

{
  const result = getBucket("11:59");
  console.log(`11:59 → MORNING: ${result === "MORNING" ? "✓ PASS" : "✗ FAIL"}`);
}

// Test AFTERNOON bucket (12pm - 4:59pm)
{
  const result = getBucket("12:00");
  console.log(
    `12:00 → AFTERNOON: ${result === "AFTERNOON" ? "✓ PASS" : "✗ FAIL"}`,
  );
}

{
  const result = getBucket("16:59");
  console.log(
    `16:59 → AFTERNOON: ${result === "AFTERNOON" ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// Test NIGHT bucket (5pm - 4:59am)
{
  const result = getBucket("17:00");
  console.log(`17:00 → NIGHT: ${result === "NIGHT" ? "✓ PASS" : "✗ FAIL"}`);
}

{
  const result = getBucket("23:59");
  console.log(`23:59 → NIGHT: ${result === "NIGHT" ? "✓ PASS" : "✗ FAIL"}`);
}

{
  const result = getBucket("04:59");
  console.log(`04:59 → NIGHT: ${result === "NIGHT" ? "✓ PASS" : "✗ FAIL"}`);
}

// Test null/undefined handling
{
  const result = getBucket(null);
  console.log(
    `null → MORNING (default): ${result === "MORNING" ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// =============================================================================
// TASK 2: isOverdue Tests
// =============================================================================

console.log("\n=== TASK 2: isOverdue Tests ===\n");

// Test dose is overdue when past grace window
{
  const scheduledTime = new Date("2026-02-22T08:00:00");
  const now = new Date("2026-02-22T09:30:00"); // 90 minutes later
  const graceMinutes = 60;
  const result = isOverdue(scheduledTime, graceMinutes, now);
  console.log(
    `90min late (60min grace): ${result === true ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// Test dose is NOT overdue when within grace window
{
  const scheduledTime = new Date("2026-02-22T08:00:00");
  const now = new Date("2026-02-22T08:45:00"); // 45 minutes later
  const graceMinutes = 60;
  const result = isOverdue(scheduledTime, graceMinutes, now);
  console.log(
    `45min late (60min grace): ${result === false ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// Test dose is NOT overdue when exactly at grace window
{
  const scheduledTime = new Date("2026-02-22T08:00:00");
  const now = new Date("2026-02-22T09:00:00"); // 60 minutes later
  const graceMinutes = 60;
  const result = isOverdue(scheduledTime, graceMinutes, now);
  console.log(
    `60min late (60min grace): ${result === false ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// Test dose is overdue just after grace window
{
  const scheduledTime = new Date("2026-02-22T08:00:00");
  const now = new Date("2026-02-22T09:01:00"); // 61 minutes later
  const graceMinutes = 60;
  const result = isOverdue(scheduledTime, graceMinutes, now);
  console.log(
    `61min late (60min grace): ${result === true ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// Test null handling
{
  const result = isOverdue(null, 60, new Date());
  console.log(`null scheduledTime: ${result === false ? "✓ PASS" : "✗ FAIL"}`);
}

// =============================================================================
// TASK 3: determineStatus Tests
// =============================================================================

console.log("\n=== TASK 3: determineStatus Tests ===\n");

// Test Priority 1: taken → TAKEN
{
  const doseLog = { action_type: "taken" };
  const scheduledTime = new Date("2026-02-22T08:00:00");
  const now = new Date("2026-02-22T08:30:00");
  const result = determineStatus(doseLog, scheduledTime, 60, now);
  console.log(
    `action_type=taken → TAKEN: ${result === "TAKEN" ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// Test Priority 2: snoozed → SNOOZED
{
  const doseLog = { action_type: "snoozed" };
  const scheduledTime = new Date("2026-02-22T08:00:00");
  const now = new Date("2026-02-22T08:30:00");
  const result = determineStatus(doseLog, scheduledTime, 60, now);
  console.log(
    `action_type=snoozed → SNOOZED: ${result === "SNOOZED" ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// Test Priority 3: overdue → MISSED
{
  const doseLog = null;
  const scheduledTime = new Date("2026-02-22T08:00:00");
  const now = new Date("2026-02-22T10:00:00"); // 2 hours later
  const result = determineStatus(doseLog, scheduledTime, 60, now);
  console.log(`overdue → MISSED: ${result === "MISSED" ? "✓ PASS" : "✗ FAIL"}`);
}

// Test Priority 4: within grace → PENDING
{
  const doseLog = null;
  const scheduledTime = new Date("2026-02-22T08:00:00");
  const now = new Date("2026-02-22T08:30:00"); // 30 minutes later
  const result = determineStatus(doseLog, scheduledTime, 60, now);
  console.log(
    `within grace → PENDING: ${result === "PENDING" ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// Test taken takes priority over missed
{
  const doseLog = { action_type: "taken" };
  const scheduledTime = new Date("2026-02-22T08:00:00");
  const now = new Date("2026-02-22T10:00:00"); // overdue
  const result = determineStatus(doseLog, scheduledTime, 60, now);
  console.log(
    `taken + overdue → TAKEN: ${result === "TAKEN" ? "✓ PASS" : "✗ FAIL"}`,
  );
}

// Test snoozed takes priority over missed
{
  const doseLog = { action_type: "snoozed" };
  const scheduledTime = new Date("2026-02-22T08:00:00");
  const now = new Date("2026-02-22T10:00:00"); // overdue
  const result = determineStatus(doseLog, scheduledTime, 60, now);
  console.log(
    `snoozed + overdue → SNOOZED: ${result === "SNOOZED" ? "✓ PASS" : "✗ FAIL"}`,
  );
}

console.log("\n=== All Unit Tests Complete ===\n");
console.log("Note: Integration tests with DB require mock setup\n");

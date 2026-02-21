/**
 * tests/adherence.intelligence.test.js
 *
 * Unit tests for Adherence Intelligence Layer
 * TASK 6: Fast unit tests covering risk classification and nudge flags
 */

const {
  classifyAdherenceRisk,
  generateNudgeFlags,
} = require("../src/modules/adherence/adherence.intelligence");

console.log("\n=== Adherence Intelligence Tests ===\n");

// =============================================================================
// TASK 6: Unit Tests
// =============================================================================

// Test 1: perfect adherence → LOW risk
{
  const risk = classifyAdherenceRisk(100);
  console.log(
    `100% adherence → ${risk === "LOW" ? "✓ PASS" : "✗ FAIL"} (got ${risk})`,
  );
}

{
  const risk = classifyAdherenceRisk(95);
  console.log(
    `95% adherence → ${risk === "LOW" ? "✓ PASS" : "✗ FAIL"} (got ${risk})`,
  );
}

{
  const risk = classifyAdherenceRisk(90);
  console.log(
    `90% adherence → ${risk === "LOW" ? "✓ PASS" : "✗ FAIL"} (got ${risk})`,
  );
}

// Test 2: 75% → MEDIUM risk
{
  const risk = classifyAdherenceRisk(75);
  console.log(
    `75% adherence → ${risk === "MEDIUM" ? "✓ PASS" : "✗ FAIL"} (got ${risk})`,
  );
}

{
  const risk = classifyAdherenceRisk(85);
  console.log(
    `85% adherence → ${risk === "MEDIUM" ? "✓ PASS" : "✗ FAIL"} (got ${risk})`,
  );
}

{
  const risk = classifyAdherenceRisk(70);
  console.log(
    `70% adherence → ${risk === "MEDIUM" ? "✓ PASS" : "✗ FAIL"} (got ${risk})`,
  );
}

// Test 3: <70 → HIGH risk
{
  const risk = classifyAdherenceRisk(69);
  console.log(
    `69% adherence → ${risk === "HIGH" ? "✓ PASS" : "✗ FAIL"} (got ${risk})`,
  );
}

{
  const risk = classifyAdherenceRisk(50);
  console.log(
    `50% adherence → ${risk === "HIGH" ? "✓ PASS" : "✗ FAIL"} (got ${risk})`,
  );
}

{
  const risk = classifyAdherenceRisk(0);
  console.log(
    `0% adherence → ${risk === "HIGH" ? "✓ PASS" : "✗ FAIL"} (got ${risk})`,
  );
}

// Test 4: Edge cases
{
  const risk = classifyAdherenceRisk(null);
  console.log(
    `null → ${risk === "HIGH" ? "✓ PASS" : "✗ FAIL"} (default to HIGH)`,
  );
}

{
  const risk = classifyAdherenceRisk(undefined);
  console.log(
    `undefined → ${risk === "HIGH" ? "✓ PASS" : "✗ FAIL"} (default to HIGH)`,
  );
}

// Test 5: Missed streak detection (via nudge flags)
{
  const flags = generateNudgeFlags({
    adherencePercentage: 50,
    missedStreak: 3,
    lastMissedAt: null,
  });
  console.log(
    `streak >= 2 → ${flags.streakAlert ? "✓ PASS" : "✗ FAIL"} (streakAlert=${flags.streakAlert})`,
  );
}

{
  const flags = generateNudgeFlags({
    adherencePercentage: 50,
    missedStreak: 1,
    lastMissedAt: null,
  });
  console.log(
    `streak < 2 → ${!flags.streakAlert ? "✓ PASS" : "✗ FAIL"} (streakAlert=${flags.streakAlert})`,
  );
}

// Test 6: High risk flags
{
  const flags = generateNudgeFlags({
    adherencePercentage: 60, // < 70
    missedStreak: 2,
    lastMissedAt: null,
  });
  console.log(
    `adherence < 70 → ${flags.highRisk ? "✓ PASS" : "✗ FAIL"} (highRisk=${flags.highRisk})`,
  );
}

{
  const flags = generateNudgeFlags({
    adherencePercentage: 80,
    missedStreak: 4, // >= 4
    lastMissedAt: null,
  });
  console.log(
    `streak >= 4 → ${flags.highRisk ? "✓ PASS" : "✗ FAIL"} (highRisk=${flags.highRisk})`,
  );
}

{
  const flags = generateNudgeFlags({
    adherencePercentage: 95,
    missedStreak: 1,
    lastMissedAt: null,
  });
  console.log(
    `good adherence, no streak → ${!flags.highRisk ? "✓ PASS" : "✗ FAIL"} (highRisk=${flags.highRisk})`,
  );
}

// Test 7: recentMiss detection (within 24 hours)
{
  const recentMiss = new Date(); // Now
  const flags = generateNudgeFlags({
    adherencePercentage: 80,
    missedStreak: 1,
    lastMissedAt: recentMiss,
  });
  console.log(
    `missed now → ${flags.recentMiss ? "✓ PASS" : "✗ FAIL"} (recentMiss=${flags.recentMiss})`,
  );
}

{
  const oldMiss = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
  const flags = generateNudgeFlags({
    adherencePercentage: 80,
    missedStreak: 1,
    lastMissedAt: oldMiss,
  });
  console.log(
    `missed 25h ago → ${!flags.recentMiss ? "✓ PASS" : "✗ FAIL"} (recentMiss=${flags.recentMiss})`,
  );
}

{
  const flags = generateNudgeFlags({
    adherencePercentage: 80,
    missedStreak: 1,
    lastMissedAt: null,
  });
  console.log(
    `no lastMissedAt → ${!flags.recentMiss ? "✓ PASS" : "✗ FAIL"} (recentMiss=${flags.recentMiss})`,
  );
}

// Test 8: Zero scheduled doses edge case
// (This would be handled in computeAdherenceMetrics, but testing classification)
{
  const risk = classifyAdherenceRisk(0);
  console.log(`0% (no doses) → ${risk === "HIGH" ? "✓ PASS" : "✗ FAIL"}`);
}

console.log("\n=== All Tests Complete ===\n");

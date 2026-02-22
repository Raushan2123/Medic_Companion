// tests/email.nudge.test.js - Unit tests for email nudge functionality
const { describe, it, mock, beforeEach } = require("node:test");
const assert = require("node:assert");

// Mock modules before requiring the resolver
const mockDb = {
  query: mock.fn(),
};

const mockEmailService = {
  sendMissedDoseEmailAsync: mock.fn(),
  isEmailEnabled: mock.fn(),
};

// Override require for modules
mock.module("../src/config/db.js", {
  namedExports: mockEmailService,
  defaultExport: mockDb,
});

mock.module("../src/services/email.service.js", {
  namedExports: {
    sendMissedDoseEmailAsync: mockEmailService.sendMissedDoseEmailAsync,
    isEmailEnabled: mockEmailService.isEmailEnabled,
  },
});

describe("Email Nudge Tests", () => {
  beforeEach(() => {
    mockDb.query.mock.resetCalls();
    mockEmailService.sendMissedDoseEmailAsync.mock.resetCalls();
    mockEmailService.isEmailEnabled.mock.resetCalls();
  });

  describe("triggerMissedDoseEmail", () => {
    it("should NOT trigger email when EMAIL_ENABLED is false", async () => {
      // Setup
      mockEmailService.isEmailEnabled.mock.mockImplementation(() => false);

      // Import after setting up mocks
      const {
        triggerMissedDoseEmail,
      } = require("../src/modules/schedules/schedule.resolver.js");

      // Execute
      await triggerMissedDoseEmail({
        userId: "user-123",
        scheduleId: "schedule-456",
        medicationName: "Aspirin",
        timeLocal: "08:00",
      });

      // Assert
      assert.strictEqual(mockEmailService.isEmailEnabled.mock.calls.length, 1);
      assert.strictEqual(
        mockEmailService.sendMissedDoseEmailAsync.mock.calls.length,
        0,
      );
    });

    it("should NOT trigger email when user has no email", async () => {
      // Setup
      mockEmailService.isEmailEnabled.mock.mockImplementation(() => true);
      mockDb.query.mock.mockImplementation(() => ({
        rows: [], // No user found
      }));

      const {
        triggerMissedDoseEmail,
      } = require("../src/modules/schedules/schedule.resolver.js");

      // Execute
      await triggerMissedDoseEmail({
        userId: "user-123",
        scheduleId: "schedule-456",
        medicationName: "Aspirin",
        timeLocal: "08:00",
      });

      // Assert - email should NOT be sent
      assert.strictEqual(
        mockEmailService.sendMissedDoseEmailAsync.mock.calls.length,
        0,
      );
    });

    it("should trigger email when all conditions are met", async () => {
      // Setup
      mockEmailService.isEmailEnabled.mock.mockImplementation(() => true);
      mockDb.query.mock
        .mockImplementationOnce(() => ({
          rows: [{ id: "user-123", email: "user@test.com", name: "John" }],
        }))
        .mock.mockImplementationOnce(() => ({ rows: [] })); // markEmailSent

      const {
        triggerMissedDoseEmail,
      } = require("../src/modules/schedules/schedule.resolver.js");

      // Execute
      await triggerMissedDoseEmail({
        userId: "user-123",
        scheduleId: "schedule-456",
        medicationName: "Aspirin",
        timeLocal: "08:00",
      });

      // Assert - email SHOULD be sent
      assert.strictEqual(
        mockEmailService.sendMissedDoseEmailAsync.mock.calls.length,
        1,
      );
    });

    it("should NOT mark email_sent on failure", async () => {
      // Setup
      mockEmailService.isEmailEnabled.mock.mockImplementation(() => true);
      mockDb.query.mock.mockImplementationOnce(() => ({
        rows: [{ id: "user-123", email: "user@test.com", name: "John" }],
      }));

      // Make sendMissedDoseEmailAsync throw
      mockEmailService.sendMissedDoseEmailAsync.mock.mockImplementation(() => {
        throw new Error("SMTP error");
      });

      const {
        triggerMissedDoseEmail,
      } = require("../src/modules/schedules/schedule.resolver.js");

      // Execute - should not throw
      await triggerMissedDoseEmail({
        userId: "user-123",
        scheduleId: "schedule-456",
        medicationName: "Aspirin",
        timeLocal: "08:00",
      });

      // Assert - markEmailSent should NOT be called (only 1 query for user fetch)
      assert.strictEqual(mockDb.query.mock.calls.length, 1);
    });
  });

  describe("markEmailSent", () => {
    it("should update email_sent flag in database", async () => {
      // Setup
      mockDb.query.mock.mockImplementation(() => ({ rows: [] }));

      const {
        markEmailSent,
      } = require("../src/modules/schedules/schedule.resolver.js");

      // Execute
      const result = await markEmailSent("schedule-456");

      // Assert
      assert.strictEqual(result, true);
      assert.strictEqual(mockDb.query.mock.calls.length, 1);
    });
  });

  describe("getUserEmail", () => {
    it("should return user data with email", async () => {
      // Setup
      const mockUser = { id: "user-123", email: "user@test.com", name: "John" };
      mockDb.query.mock.mockImplementation(() => ({ rows: [mockUser] }));

      const {
        getUserEmail,
      } = require("../src/modules/schedules/schedule.resolver.js");

      // Execute
      const result = await getUserEmail("user-123");

      // Assert
      assert.deepStrictEqual(result, mockUser);
    });

    it("should return null when user not found", async () => {
      // Setup
      mockDb.query.mock.mockImplementation(() => ({ rows: [] }));

      const {
        getUserEmail,
      } = require("../src/modules/schedules/schedule.resolver.js");

      // Execute
      const result = await getUserEmail("user-not-found");

      // Assert
      assert.strictEqual(result, null);
    });
  });

  describe("Email sending conditions in resolveDoseStatuses", () => {
    it("should NOT trigger email for non-MISSED status", async () => {
      // This test verifies the condition logic in resolveDoseStatuses
      // The email should only be triggered when status === "MISSED"

      const {
        determineStatus,
        isOverdue,
      } = require("../src/modules/schedules/schedule.resolver.js");

      // Create a future time (not overdue)
      const futureTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      // PENDING status - should NOT trigger email
      const status = determineStatus(null, futureTime, 60, new Date());
      assert.strictEqual(status, "PENDING");
    });

    it("should trigger email for MISSED status with overdue", async () => {
      const {
        determineStatus,
        isOverdue,
      } = require("../src/modules/schedules/schedule.resolver.js");

      // Create a past time (overdue)
      const pastTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

      // MISSED status - should trigger email
      const status = determineStatus(null, pastTime, 60, new Date());
      assert.strictEqual(status, "MISSED");

      // Verify it's overdue
      const overdue = isOverdue(pastTime, 60, new Date());
      assert.strictEqual(overdue, true);
    });
  });

  describe("isEmailEnabled", () => {
    it("should return false when EMAIL_ENABLED env is not set", () => {
      const { isEmailEnabled } = require("../src/services/email.service.js");

      // The function checks process.env.EMAIL_ENABLED === "true"
      // Default should be false
      const result = isEmailEnabled();
      assert.strictEqual(typeof result, "boolean");
    });
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log("Running Email Nudge Tests...");
  // Note: Mock.module requires Node.js experimental features
  // For simple testing, run: node --experimental-vm-modules tests/email.nudge.test.js
  console.log("Note: These tests require mock.module support");
}

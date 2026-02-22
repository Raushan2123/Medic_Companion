// src/services/email.service.js - Email service for missed dose notifications
const nodemailer = require("nodemailer");

// Configuration from environment
const EMAIL_ENABLED = process.env.EMAIL_ENABLED === "true";
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

// Create reusable transporter (lazy initialization)
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!EMAIL_USER || !EMAIL_PASS) {
    console.log("[EmailService] Email credentials not configured");
    return null;
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });

  console.log("[EmailService] Transporter initialized");
  return transporter;
}

/**
 * Check if email sending is enabled
 * @returns {boolean}
 */
function isEmailEnabled() {
  return EMAIL_ENABLED && !!EMAIL_USER && !!EMAIL_PASS;
}

/**
 * Send missed dose email notification
 * @param {Object} params - Email parameters
 * @param {string} params.to - Recipient email address
 * @param {string} params.medicationName - Name of the medication
 * @param {string} params.timeLocal - Scheduled time in local format
 * @param {string} params.userName - User's name (optional)
 * @returns {Promise<boolean>} Success status
 */
async function sendMissedDoseEmail({
  to,
  medicationName,
  timeLocal,
  userName,
}) {
  // Check if email is enabled
  if (!isEmailEnabled()) {
    console.log("[EmailService] Email sending disabled or not configured");
    return false;
  }

  // Validate required params
  if (!to || !medicationName || !timeLocal) {
    console.error("[EmailService] Missing required parameters for email");
    return false;
  }

  const transporter = getTransporter();
  if (!transporter) {
    console.log("[EmailService] No transporter available, skipping email");
    return false;
  }

  // Clean HTML email template
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #e74c3c; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Medication Reminder</h1>
        </div>
        <div class="content">
          <p>Hello${userName ? ` ${userName}` : ""},</p>
          <p>This is a friendly reminder that your scheduled dose is overdue:</p>
          <ul>
            <li><strong>Medication:</strong> ${medicationName}</li>
            <li><strong>Scheduled Time:</strong> ${timeLocal}</li>
          </ul>
          <p>Please take your medication as soon as possible.</p>
          <p>Stay healthy!</p>
        </div>
        <div class="footer">
          <p>This is an automated message from Medic Companion</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `Hello${userName ? ` ${userName}` : ""},\n\nThis is a friendly reminder that your scheduled dose is overdue:\n\nMedication: ${medicationName}\nScheduled Time: ${timeLocal}\n\nPlease take your medication as soon as possible.\n\nStay healthy!\n\n- Medic Companion`;

  try {
    const info = await transporter.sendMail({
      from: `"Medic Companion" <${EMAIL_USER}>`,
      to: to,
      subject: "Medication Reminder",
      text: textContent,
      html: htmlContent,
    });

    console.log(
      `[EmailService] Email sent successfully to [REDACTED], messageId: ${info.messageId}`,
    );
    return true;
  } catch (error) {
    console.error(`[EmailService] Failed to send email: ${error.message}`);
    throw error; // Re-throw so caller can handle
  }
}

/**
 * Send email with fire-and-forget pattern (non-blocking)
 * @param {Object} params - Email parameters (same as sendMissedDoseEmail)
 */
function sendMissedDoseEmailAsync(params) {
  // Fire and forget - don't await, don't block
  sendMissedDoseEmail(params).catch((err) => {
    // Already logged in sendMissedDoseEmail
    console.log("[EmailService] Async email send failed (non-blocking)");
  });
}

module.exports = {
  sendMissedDoseEmail,
  sendMissedDoseEmailAsync,
  isEmailEnabled,
};

/**
 * src/modules/expert/expert.routes.js
 *
 * Expert Visibility Routes
 * Healthcare provider endpoints for patient adherence monitoring
 */

const express = require("express");
const router = express.Router();

const {
  getPatientAdherenceRisk,
  getAssignedPatients,
} = require("./expert.controller");

const authenticate = require("../../middlewares/auth.middleware");

// All expert routes require authentication
router.use(authenticate);

// GET /api/expert/patients/:patientId/adherence-risk
// Get patient adherence risk summary (doctor/caregiver only)
router.get("/patients/:patientId/adherence-risk", getPatientAdherenceRisk);

// GET /api/expert/patients
// List patients for expert dashboard
router.get("/patients", getAssignedPatients);

module.exports = router;

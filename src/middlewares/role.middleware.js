// src/middlewares/role.middleware.js - Role-based access control middleware
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required roles: ${roles.join(", ")}`,
      });
    }

    next();
  };
};

// Middleware to check if user is a doctor
const requireDoctor = requireRole("doctor");

// Middleware to check if user is a patient
const requirePatient = requireRole("patient");

// Middleware to check if user is either doctor or patient
const requireDoctorOrPatient = requireRole("doctor", "patient");

module.exports = {
  requireRole,
  requireDoctor,
  requirePatient,
  requireDoctorOrPatient,
};

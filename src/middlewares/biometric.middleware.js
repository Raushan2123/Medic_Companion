const requireBiometricUnlock = (req, res, next) => {
  if (!req.user.biometricUnlocked) {
    return res.status(403).json({
      error: "Biometric unlock required via native device prompt.",
    });
  }
  next();
};

module.exports = requireBiometricUnlock;

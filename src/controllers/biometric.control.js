const jwt = require("jsonwebtoken");

const biometricUnlock = (req, res) => {
  const elevatedToken = jwt.sign(
    {
      id: req.user.id,
      role: req.user.role,
      biometricUnlocked: true,
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m" },
  );

  res.json({ message: "Caregiver unlocked", token: elevatedToken });
};

module.exports = { biometricUnlock };

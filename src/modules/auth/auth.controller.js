// src/modules/auth/auth.controller.js - Authentication controller
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../../config/db");

// Register new user
const register = async (req, res) => {
  try {
    const { email, password, name, role, phone, dateOfBirth, timezone } =
      req.body;

    // Validate required fields
    if (!email || !password || !name || !role) {
      return res
        .status(400)
        .json({ error: "Email, password, name, and role are required" });
    }

    // Validate role
    if (!["patient", "doctor", "caregiver"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    // Check if user exists
    const existingUser = await db.query(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: "User already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert user
    const result = await db.query(
      `INSERT INTO users (email, password_hash, name, role, phone, date_of_birth, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, name, role, phone, created_at`,
      [
        email,
        passwordHash,
        name,
        role,
        phone || null,
        dateOfBirth || null,
        timezone || "UTC",
      ],
    );

    const user = result.rows[0];

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        createdAt: user.created_at,
      },
      token,
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Failed to register user" });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user
    const result = await db.query(
      "SELECT id, email, password_hash, name, role, phone FROM users WHERE email = $1",
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
      },
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Failed to login" });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, name, role, phone, date_of_birth, timezone, created_at
       FROM users WHERE id = $1`,
      [req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      dateOfBirth: user.date_of_birth,
      timezone: user.timezone,
      createdAt: user.created_at,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Failed to get profile" });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const { name, phone, dateOfBirth, timezone } = req.body;

    const result = await db.query(
      `UPDATE users 
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           date_of_birth = COALESCE($3, date_of_birth),
           timezone = COALESCE($4, timezone),
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, email, name, role, phone, date_of_birth, timezone`,
      [name, phone, dateOfBirth, timezone, req.user.id],
    );

    const user = result.rows[0];
    res.json({
      message: "Profile updated",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        dateOfBirth: user.date_of_birth,
        timezone: user.timezone,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
};

module.exports = { register, login, getProfile, updateProfile };

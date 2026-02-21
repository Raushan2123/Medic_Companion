const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const db = require('./db');

const app = express();
app.use(express.json());
app.use(cors());

const TEAMMATE_AI_SERVICE_URL = process.env.AI_SERVICE_URL;

// --- SECURITY MIDDLEWARES ---
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = decoded;
        next();
    });
};

const requireBiometricUnlock = (req, res, next) => {
    if (!req.user.biometricUnlocked) {
        return res.status(403).json({ error: 'Biometric unlock required via native device prompt.' });
    }
    next();
};

// --- ROUTES ---

// 1. Biometric Unlock (Upgrades JWT)
app.post('/api/biometric-unlock', authenticate, (req, res) => {
    const elevatedToken = jwt.sign(
        { id: req.user.id, role: req.user.role, biometricUnlocked: true }, 
        process.env.JWT_SECRET, 
        { expiresIn: '15m' }
    );
    res.json({ message: 'Caregiver unlocked', token: elevatedToken });
});

// 2. AI Schedule Generator (Proxies to Teammate's Microservice)
app.post('/api/ai-schedule', authenticate, requireBiometricUnlock, async (req, res) => {
    try {
        const { patientId, prompt } = req.body;

        const medsQuery = await db.query('SELECT id, name FROM medications WHERE patient_id = $1', [patientId]);
        const currentMeds = medsQuery.rows;

        // Fetch from Teammate's service
        const aiResponse = await fetch(TEAMMATE_AI_SERVICE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patientMeds: currentMeds, userPrompt: prompt })
        });

        if (!aiResponse.ok) throw new Error('Teammate AI service failed');
        const aiData = await aiResponse.json();

        // Save to Database safely
        await db.query('BEGIN');
        for (const sched of aiData.suggestedSchedules) {
            await db.query(
                `INSERT INTO schedules (medication_id, dosage_amount, time_of_day, special_instructions) 
                 VALUES ($1, $2, $3, $4)`,
                [sched.medicationId, sched.dosageAmount, sched.timeOfDay, sched.specialInstructions]
            );
        }
        for (const warning of aiData.warnings) {
            await db.query(
                `INSERT INTO ai_warnings (patient_id, conflict_description, severity) 
                 VALUES ($1, $2, $3)`,
                [patientId, warning.conflictDescription, warning.severity]
            );
        }
        await db.query('COMMIT');
        
        res.json({ message: 'Schedule applied securely', data: aiData });

    } catch (error) {
        await db.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: 'Failed to process AI schedule' });
    }
});

// 3. Offline Sync UPSERT Route
app.post('/api/sync', authenticate, async (req, res) => {
    const { offlineLogs } = req.body;
    try {
        await db.query('BEGIN');
        
        for (const log of offlineLogs) {
            await db.query(
                `INSERT INTO dose_logs (id, schedule_id, patient_id, scheduled_time, action_time, status)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, action_time = EXCLUDED.action_time`,
                [log.id, log.scheduleId, log.patientId, log.scheduledTime, log.actionTime, log.status]
            );

            if (log.status === 'TAKEN') {
                await db.query(
                    `UPDATE medications SET total_inventory = total_inventory - 1 WHERE id = 
                    (SELECT medication_id FROM schedules WHERE id = $1)`,
                    [log.scheduleId]
                );
            }
        }
        
        await db.query('COMMIT');
        res.json({ message: 'Sync successful' });
    } catch (error) {
        await db.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: 'Offline sync failed' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
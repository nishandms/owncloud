const express = require('express');
const router = express.Router();
const scanner = require('../services/scanner');
const aiAgent = require('../services/aiAgent');

let latestLogs = [];
let threatAssessment = { status: "IDLE", message: "System initializing..." };

router.get('/watchdog/status', (req, res) => {
    res.json({ logs: latestLogs, assessment: threatAssessment });
});

router.post('/network/scan', async (req, res) => {
    res.json({ message: 'Scan initiated' }); // Return immediately for async execution
    
    try {
        const devices = await scanner.runPingScan();
        latestLogs = devices;
        
        const assessment = await aiAgent.analyzeThreats(devices);
        threatAssessment = assessment;
        
        // Asynchronous Deep Port Scan for unknown devices
        const unknownDevices = devices.filter(d => !d.vendor); 
        for (const device of unknownDevices) {
            await scanner.runPortScan(device.ip); // Log output as needed
        }
    } catch (err) {
        console.error("Network scan failed:", err);
        threatAssessment = { status: "ERROR", message: "Network scan encountered an error." };
    }
});

module.exports = router;

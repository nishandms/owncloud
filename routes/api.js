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
        
        // Asynchronous Deep Port Scan for all devices
        for (const device of devices) {
            scanner.runPortScan(device.ip).then(details => {
                const cleanDetails = details.replace(/Starting Nmap.*?\n/g, '').replace(/Nmap scan report for.*?\n/g, '').replace(/Host is up.*?\n/g, '').trim();
                device.details = cleanDetails || 'No open ports or services found.';
            }).catch(err => {
                device.details = 'Port scan failed.';
            });
        }
    } catch (err) {
        console.error("Network scan failed:", err);
        threatAssessment = { status: "ERROR", message: "Network scan encountered an error." };
    }
});

module.exports = router;

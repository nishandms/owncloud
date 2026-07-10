const express = require('express');
const router = express.Router();
const scanner = require('../services/scanner');
const aiAgent = require('../services/aiAgent');
const os = require('os');

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
            scanner.runPortScan(device.ip).then(scanResult => {
                device.details = scanResult.details || 'No open ports or services found.';
                device.os = scanResult.os || 'Unknown';
            }).catch(err => {
                device.details = 'Port scan failed.';
                device.os = 'Unknown';
            });
        }
    } catch (err) {
        console.error("Network scan failed:", err);
        threatAssessment = { status: "ERROR", message: "Network scan encountered an error." };
    }
});

// Admin Dashboard Endpoints
router.get('/system/health', (req, res) => {
    const load = os.loadavg()[0]; // 1 min load avg
    const totalMem = os.totalmem();
    const usedMem = totalMem - os.freemem();
    res.json({
        cpuLoad: load.toFixed(2),
        memUsedPercent: Math.round((usedMem / totalMem) * 100),
        uptime: os.uptime()
    });
});

router.get('/system/logs', (req, res) => {
    res.json({ logs: global.activityLogs || [] });
});

router.get('/firewall/blocks', (req, res) => {
    res.json({ blocked: Array.from(global.blockedIPs || []) });
});

router.post('/firewall/block', (req, res) => {
    const { ip } = req.body;
    if (ip) {
        if (!global.blockedIPs) global.blockedIPs = new Set();
        global.blockedIPs.add(ip);
        if (global.logActivity) global.logActivity(`IP Blocked: ${ip}`, 'warning');
        res.json({ message: 'IP Blocked' });
    } else {
        res.status(400).json({ error: 'IP required' });
    }
});

router.post('/firewall/unblock', (req, res) => {
    const { ip } = req.body;
    if (ip && global.blockedIPs) {
        global.blockedIPs.delete(ip);
        if (global.logActivity) global.logActivity(`IP Unblocked: ${ip}`, 'info');
        res.json({ message: 'IP Unblocked' });
    } else {
        res.status(400).json({ error: 'IP required' });
    }
});

module.exports = router;

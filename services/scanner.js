const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function runPingScan() {
    try {
        // Utilizing native nmap package
        const { stdout } = await execPromise('nmap -sn 192.168.1.0/24');
        const lines = stdout.split('\n');
        const devices = [];
        let currentIp = null;

        for (let line of lines) {
            const ipMatch = line.match(/Nmap scan report for (?:.*? \()?([\d.]+)\)?/);
            if (ipMatch) currentIp = ipMatch[1];
            
            const macMatch = line.match(/MAC Address: ([0-9A-F:]+) \((.*?)\)/i);
            if (macMatch && currentIp) {
                devices.push({
                    ip: currentIp,
                    mac: macMatch[1].toUpperCase(),
                    vendor: macMatch[2],
                    timestamp: new Date().toISOString()
                });
                currentIp = null;
            }
        }
        return devices;
    } catch (err) {
        console.error("Ping scan error:", err);
        return [];
    }
}

async function runPortScan(ip) {
    try {
        const { stdout } = await execPromise(`nmap -sV -F ${ip}`);
        return stdout;
    } catch (err) {
        return "Port scan failed";
    }
}

module.exports = { runPingScan, runPortScan };

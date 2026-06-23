const { exec } = require('child_process');
const util = require('util');
const os = require('os');
const execPromise = util.promisify(exec);

function getLocalSubnet() {
    try {
        const { execSync } = require('child_process');
        const routes = execSync('ip route show').toString();
        
        // Find default interface
        const defaultMatch = routes.match(/default via .*? dev (\S+)/);
        if (defaultMatch) {
            const defaultDev = defaultMatch[1];
            // Find subnet for that device
            const subnetRegex = new RegExp(`^([0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+/[0-9]+)\\s+dev\\s+${defaultDev}\\s+proto\\s+kernel\\s+scope\\s+link`, 'm');
            const subnetMatch = routes.match(subnetRegex);
            if (subnetMatch) {
                return subnetMatch[1];
            }
        }
    } catch(e) {
        console.error("Failed to parse ip route, using fallback:", e.message);
    }

    // Fallback
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                const ipParts = iface.address.split('.');
                ipParts[3] = '0/24';
                return ipParts.join('.');
            }
        }
    }
    return '192.168.1.0/24';
}

async function runPingScan() {
    try {
        const targetSubnet = process.env.SCAN_SUBNET || getLocalSubnet();
        console.log(`Starting nmap scan on target subnet: ${targetSubnet}`);
        
        // Utilizing native nmap package dynamically
        const { stdout } = await execPromise(`nmap -sn ${targetSubnet}`);
        const lines = stdout.split('\n');
        const devices = [];
        let currentDevice = null;

        for (let line of lines) {
            const ipMatch = line.match(/Nmap scan report for (?:.*? \()?([\d.]+)\)?/);
            if (ipMatch) {
                if (currentDevice) devices.push(currentDevice);
                currentDevice = {
                    ip: ipMatch[1],
                    mac: 'UNKNOWN',
                    vendor: 'UNKNOWN',
                    timestamp: new Date().toISOString()
                };
            }
            
            const macMatch = line.match(/MAC Address: ([0-9A-F:]+) \((.*?)\)/i);
            if (macMatch && currentDevice) {
                currentDevice.mac = macMatch[1].toUpperCase();
                currentDevice.vendor = macMatch[2];
            }
        }
        if (currentDevice) devices.push(currentDevice);
        
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

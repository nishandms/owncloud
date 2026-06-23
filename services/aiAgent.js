const fs = require('fs');
const path = require('path');
const http = require('http');

async function analyzeThreats(devices) {
    const whitelistPath = path.join(__dirname, '../config/whitelist.json');
    let whitelist = {};
    if (fs.existsSync(whitelistPath)) {
        whitelist = JSON.parse(fs.readFileSync(whitelistPath, 'utf8'));
    }

    const unknownDevices = devices.filter(d => !whitelist[d.mac]);
    
    if (unknownDevices.length === 0) {
        return { status: "SECURE", message: "All detected devices are recognized and authorized." };
    }

    const prompt = `You are J.A.R.V.I.S., an autonomous Network Security Watchdog. 
Analyze these unrecognized devices on the network: ${JSON.stringify(unknownDevices)}. 
Respond with a strict JSON format containing a "status" (WARNING or CRITICAL) and a "message" providing your verbal security brief. Do not output anything other than JSON.`;

    const aiUrl = process.env.AI_API_URL || 'http://127.0.0.1:11434/api/generate';
    const aiModel = process.env.AI_MODEL || 'qwen2.5:0.b';

    return new Promise((resolve) => {
        const payload = JSON.stringify({ model: aiModel, prompt: prompt, stream: false, format: "json" });
        const { URL } = require('url');
        
        try {
            const parsedUrl = new URL(aiUrl);
            const req = http.request({
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const responseObj = JSON.parse(data);
                        resolve(JSON.parse(responseObj.response));
                    } catch (e) {
                        resolve({ status: "UNKNOWN", message: "Failed to parse AI response." });
                    }
                });
            });

            req.on('error', () => resolve({ status: "ERROR", message: "AI backend unreachable." }));
            req.write(payload);
            req.end();
        } catch (err) {
            resolve({ status: "ERROR", message: "Invalid AI URL." });
        }
    });
}

module.exports = { analyzeThreats };

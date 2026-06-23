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
            parsedUrl.pathname = '/api/generate'; // Force the /generate endpoint for this payload format
            
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
                        // Handle non-200 responses like HTML 404 pages
                        if (data.trim().startsWith('<')) throw new Error("Received HTML instead of JSON");
                        
                        const responseObj = JSON.parse(data);
                        if (responseObj.error) throw new Error(responseObj.error);

                        let aiText = responseObj.response || "{}";
                        
                        // Strip markdown formatting if the model wrapped it (e.g. ```json ... ```)
                        aiText = aiText.replace(/```json/ig, '').replace(/```/g, '').trim();
                        
                        resolve(JSON.parse(aiText));
                    } catch (e) {
                        console.error("AI parse error/offline:", e.message);
                        resolve({ status: "WARNING", message: `AI offline. Procedural scan flagged ${unknownDevices.length} unrecognized devices requiring manual review.` });
                    }
                });
            });

            req.on('error', (e) => {
                console.error("AI Connection Error:", e.message);
                resolve({ status: "WARNING", message: `AI unreachable. Procedural scan flagged ${unknownDevices.length} unrecognized devices requiring manual review.` });
            });
            
            req.write(payload);
            req.end();
        } catch (err) {
            resolve({ status: "ERROR", message: "Invalid AI Configuration." });
        }
    });
}

module.exports = { analyzeThreats };

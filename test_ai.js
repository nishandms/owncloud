const { analyzeThreats } = require('./services/aiAgent.js');
analyzeThreats([{ip: '192.168.1.100', mac: 'UNKNOWN', vendor: 'UNKNOWN'}]).then(console.log);

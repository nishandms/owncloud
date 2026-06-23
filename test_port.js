const net = require('net');
const port = 8443;

const server = net.createServer();

server.once('error', function(err) {
  if (err.code === 'EADDRINUSE') {
    console.log('Port ' + port + ' is in use');
  } else {
    console.log(err);
  }
});

server.once('listening', function() {
  console.log('Port ' + port + ' is available');
  server.close();
});

server.listen(port);

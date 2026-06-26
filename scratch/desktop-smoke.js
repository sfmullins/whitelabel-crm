const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const binaryPath = path.resolve(__dirname, '../desktop/out/whitelabel-crm-linux-x64/whitelabel-crm');

console.log(`Locating packaged executable at: ${binaryPath}`);

if (!fs.existsSync(binaryPath)) {
  console.error(`ERROR: Packaged binary not found at ${binaryPath}. Did you run packaging first?`);
  process.exit(1);
}

console.log('Starting packaged Electron application in logging mode...');

const env = {
  ...process.env,
  ELECTRON_ENABLE_LOGGING: '1'
};

const child = spawn(binaryPath, [], { env });

let output = '';
let serverUrl = null;
let resolved = false;

// Auto-timeout after 15 seconds
const timeout = setTimeout(() => {
  if (!resolved) {
    console.error('ERROR: Smoke test timed out after 15 seconds.');
    cleanup(1);
  }
}, 15000);

child.stdout.on('data', (data) => {
  const str = data.toString();
  output += `[STDOUT] ${str}`;
  process.stdout.write(str);
  checkForServerUrl(str);
});

child.stderr.on('data', (data) => {
  const str = data.toString();
  output += `[STDERR] ${str}`;
  process.stderr.write(str);
  checkForServerUrl(str);
});

child.on('close', (code) => {
  console.log(`Application process closed with exit code: ${code}`);
  if (!resolved) {
    console.error('ERROR: Application exited prematurely before health checks passed.');
    cleanup(1);
  }
});

function checkForServerUrl(data) {
  if (resolved || serverUrl) return;

  // Search for the startup URL output
  const match = data.match(/Embedded server started at:\s*(http:\/\/127\.0\.0\.1:\d+)/);
  if (match) {
    serverUrl = match[1];
    console.log(`Detected embedded server running at: ${serverUrl}`);
    runHealthCheck(serverUrl);
  }
}

function runHealthCheck(urlStr) {
  console.log(`Executing health check request to ${urlStr}/health...`);
  
  const url = new URL(urlStr);
  const options = {
    hostname: url.hostname,
    port: url.port,
    path: '/health',
    method: 'GET',
    timeout: 3000
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      console.log(`Health check response status: ${res.statusCode}`);
      console.log(`Health check body: ${body}`);

      try {
        const parsed = JSON.parse(body);
        if (res.statusCode === 200 && parsed.status === 'OK') {
          console.log('SUCCESS: Package launched successfully, database migrated, and health check passed!');
          resolved = true;
          cleanup(0);
        } else {
          console.error('ERROR: Health check response was invalid.');
          cleanup(1);
        }
      } catch (err) {
        console.error(`ERROR: Failed to parse health check response: ${err}`);
        cleanup(1);
      }
    });
  });

  req.on('error', (err) => {
    console.error(`ERROR: Health check request failed: ${err.message}`);
    cleanup(1);
  });

  req.end();
}

function cleanup(exitCode) {
  clearTimeout(timeout);
  resolved = true;

  if (child && !child.killed) {
    console.log('Terminating Electron application process...');
    child.kill('SIGTERM');
    
    // Give it a moment, then force-kill if still alive
    setTimeout(() => {
      try {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      } catch (e) {}
      
      if (exitCode !== 0) {
        console.log('\n--- CAPTURED LOGS ON FAILURE ---');
        console.log(output);
        console.log('--------------------------------\n');
      }
      
      process.exit(exitCode);
    }, 1000);
  } else {
    process.exit(exitCode);
  }
}

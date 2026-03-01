/**
 * Network and connectivity checks
 */

const { runCommand, success, error, warning, info } = require('../lib/utils');

/**
 * Check if required ports are available
 * @param {number[]} ports - Array of ports to check
 * @returns {Promise<{port: number, available: boolean}[]>}
 */
async function checkPorts(ports = [9090, 5432, 9000, 9001, 6379]) {
  const results = [];
  
  for (const port of ports) {
    // Try to detect listening processes on the port
    // This is a simplified check - in production you'd use platform-specific commands
    const result = await runCommand(`netstat -an | grep LISTEN | grep ${port}`);
    const available = !result.success || result.stdout === '';
    results.push({ port, available });
  }

  return results;
}

/**
 * Check internet connectivity
 * @returns {Promise<boolean>}
 */
async function checkInternet() {
  const result = await runCommand('ping -c 1 8.8.8.8 2>/dev/null || ping -n 1 8.8.8.8 2>nul');
  return result.success;
}

/**
 * Run network checks and report status
 * @returns {Promise<boolean>} True if network is ready
 */
async function verifyNetwork() {
  info('Checking network configuration...');

  // Check internet connectivity
  const hasInternet = await checkInternet();
  if (!hasInternet) {
    warning('No internet connection detected');
    info('Hub can run locally, but cannot download Docker images or connect to registry');
  } else {
    success('Internet connection is available');
  }

  // Check critical ports
  const portChecks = await checkPorts([9090]);
  const portBlocked = portChecks.some(p => !p.available);

  if (portBlocked) {
    const blockedPorts = portChecks.filter(p => !p.available).map(p => p.port);
    warning(`Port(s) ${blockedPorts.join(', ')} may be in use`);
    info('Hub services may fail to start if ports are occupied');
    info('Change API_PORT in .env if port 9090 is in use');
  } else {
    success('Required ports appear to be available');
  }

  return true; // Network checks are informational, not blocking
}

module.exports = {
  checkPorts,
  checkInternet,
  verifyNetwork,
};

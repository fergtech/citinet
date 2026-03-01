/**
 * Docker installation check
 */

const { commandExists, runCommand, success, error, warning, info } = require('../lib/utils');

/**
 * Check if Docker is installed and running
 * @returns {Promise<{installed: boolean, running: boolean, version: string}>}
 */
async function checkDocker() {
  const installed = await commandExists('docker');
  
  if (!installed) {
    return { installed: false, running: false, version: null };
  }

  // Check version
  const versionResult = await runCommand('docker --version');
  const version = versionResult.stdout.match(/(\d+\.\d+\.\d+)/)?.[1] || 'unknown';

  // Check if Docker daemon is running
  const psResult = await runCommand('docker ps');
  const running = psResult.success;

  return { installed, running, version };
}

/**
 * Check if Docker Compose is available
 * @returns {Promise<{installed: boolean, version: string}>}
 */
async function checkDockerCompose() {
  // Try docker compose (v2, built into Docker Desktop)
  const composeV2 = await runCommand('docker compose version');
  if (composeV2.success) {
    const version = composeV2.stdout.match(/(\d+\.\d+\.\d+)/)?.[1] || 'unknown';
    return { installed: true, version, command: 'docker compose' };
  }

  // Try docker-compose (v1, standalone)
  const composeV1 = await commandExists('docker-compose');
  if (composeV1) {
    const versionResult = await runCommand('docker-compose --version');
    const version = versionResult.stdout.match(/(\d+\.\d+\.\d+)/)?.[1] || 'unknown';
    return { installed: true, version, command: 'docker-compose' };
  }

  return { installed: false, version: null, command: null };
}

/**
 * Run Docker checks and report status
 * @returns {Promise<boolean>} True if Docker is ready
 */
async function verifyDocker() {
  info('Checking Docker installation...');

  const docker = await checkDocker();
  const compose = await checkDockerCompose();

  if (!docker.installed) {
    error('Docker is not installed');
    warning('Install Docker Desktop from: https://www.docker.com/products/docker-desktop');
    return false;
  }

  success(`Docker ${docker.version} is installed`);

  if (!docker.running) {
    error('Docker daemon is not running');
    warning('Start Docker Desktop or Docker Engine');
    return false;
  }

  success('Docker daemon is running');

  if (!compose.installed) {
    error('Docker Compose is not available');
    warning('Install Docker Compose from: https://docs.docker.com/compose/install/');
    return false;
  }

  success(`Docker Compose ${compose.version} is available (${compose.command})`);

  return true;
}

module.exports = {
  checkDocker,
  checkDockerCompose,
  verifyDocker,
};

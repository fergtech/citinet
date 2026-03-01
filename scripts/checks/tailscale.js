/**
 * Tailscale installation check
 */

const { commandExists, runCommand, success, warning, info } = require('../lib/utils');

/**
 * Check if Tailscale is installed and authenticated
 * @returns {Promise<{installed: boolean, authenticated: boolean, version: string}>}
 */
async function checkTailscale() {
  const installed = await commandExists('tailscale');
  
  if (!installed) {
    return { installed: false, authenticated: false, version: null };
  }

  // Check version
  const versionResult = await runCommand('tailscale version');
  const version = versionResult.stdout.split('\n')[0].trim() || 'unknown';

  // Check if authenticated
  const statusResult = await runCommand('tailscale status');
  const authenticated = statusResult.success;

  return { installed, authenticated, version };
}

/**
 * Run Tailscale checks and report status (optional check)
 * @returns {Promise<boolean>} True if Tailscale is ready or skipped
 */
async function verifyTailscale() {
  info('Checking Tailscale installation (optional)...');

  const tailscale = await checkTailscale();

  if (!tailscale.installed) {
    warning('Tailscale is not installed (optional for public access)');
    info('To make your hub publicly accessible, install Tailscale:');
    info('  https://tailscale.com/download');
    return true; // Not required, so return true
  }

  success(`Tailscale ${tailscale.version} is installed`);

  if (!tailscale.authenticated) {
    warning('Tailscale is not authenticated');
    info('Run: tailscale login');
    return true; // Not required, so return true
  }

  success('Tailscale is authenticated');

  return true;
}

module.exports = {
  checkTailscale,
  verifyTailscale,
};

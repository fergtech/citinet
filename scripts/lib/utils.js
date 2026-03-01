/**
 * Shared utilities for setup scripts
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * Detect operating system
 * @returns {'windows' | 'macos' | 'linux' | 'unknown'}
 */
function detectOS() {
  const platform = process.platform;
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux') return 'linux';
  return 'unknown';
}

/**
 * Check if a command exists on the system
 * @param {string} command - Command to check
 * @returns {Promise<boolean>}
 */
async function commandExists(command) {
  const os = detectOS();
  const checkCmd = os === 'windows' 
    ? `where ${command} 2>nul`
    : `which ${command} 2>/dev/null`;
  
  try {
    await execAsync(checkCmd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a shell command and return output
 * @param {string} command - Command to execute
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
async function runCommand(command) {
  try {
    const { stdout, stderr } = await execAsync(command);
    return { stdout: stdout.trim(), stderr: stderr.trim(), success: true };
  } catch (error) {
    return { 
      stdout: error.stdout?.trim() || '', 
      stderr: error.stderr?.trim() || error.message, 
      success: false 
    };
  }
}

/**
 * Format output with colors (using ANSI codes)
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function success(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function error(message) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function warning(message) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function info(message) {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

function header(message) {
  console.log(`\n${colors.bright}${colors.cyan}${message}${colors.reset}`);
  console.log('='.repeat(message.length));
}

module.exports = {
  detectOS,
  commandExists,
  runCommand,
  success,
  error,
  warning,
  info,
  header,
  colors,
};

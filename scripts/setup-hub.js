#!/usr/bin/env node

/**
 * Citinet Hub Setup Script
 * 
 * Checks prerequisites and guides users through hub setup process.
 * Usage: npm run hub:setup
 */

const fs = require('fs');
const path = require('path');
const { header, success, error, warning, info, colors } = require('./lib/utils');
const { verifyDocker } = require('./checks/docker');
const { verifyTailscale } = require('./checks/tailscale');
const { verifyNetwork } = require('./checks/network');

async function main() {
  console.clear();
  
  header('🚀 Citinet Hub Setup');
  console.log('This script will verify your system is ready to run a Citinet hub.\n');

  let allChecksPassed = true;

  // Check 1: Docker
  header('Step 1: Docker Environment');
  const dockerReady = await verifyDocker();
  if (!dockerReady) {
    allChecksPassed = false;
  }

  // Check 2: Network
  header('Step 2: Network Configuration');
  await verifyNetwork();

  // Check 3: Tailscale (optional)
  header('Step 3: Tunnel Setup (Optional)');
  await verifyTailscale();

  // Check 4: Configuration file
  header('Step 4: Hub Configuration');
  const envPath = path.join(process.cwd(), '.env');
  const envExamplePath = path.join(process.cwd(), '.env.example');

  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(envExamplePath)) {
      warning('.env file not found');
      info('Copy .env.example to .env and configure your hub settings:');
      info(`  ${colors.cyan}cp .env.example .env${colors.reset} (Mac/Linux)`);
      info(`  ${colors.cyan}copy .env.example .env${colors.reset} (Windows)`);
      allChecksPassed = false;
    } else {
      error('.env.example not found');
      info('Download setup files from the Citinet web app');
      allChecksPassed = false;
    }
  } else {
    success('.env configuration file exists');
    
    // Check for default/insecure values
    const envContent = fs.readFileSync(envPath, 'utf8');
    const hasChangeme = envContent.includes('changeme');
    
    if (hasChangeme) {
      warning('.env contains default "changeme" values');
      info('Update passwords and secrets in .env before starting your hub');
      allChecksPassed = false;
    } else {
      success('Configuration appears to be customized');
    }
  }

  // Check 5: Docker Compose file
  const composeFile = fs.existsSync(path.join(process.cwd(), 'docker-compose.yml'));
  if (!composeFile) {
    error('docker-compose.yml not found');
    info('Download setup files from the Citinet web app');
    allChecksPassed = false;
  } else {
    success('docker-compose.yml found');
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  if (allChecksPassed) {
    console.log(`${colors.green}${colors.bright}✓ All checks passed! Your system is ready.${colors.reset}\n`);
    info('Next steps:');
    console.log(`  1. Review your .env configuration`);
    console.log(`  2. Start the hub: ${colors.cyan}docker-compose up -d${colors.reset}`);
    console.log(`  3. Check status: ${colors.cyan}docker-compose ps${colors.reset}`);
    console.log(`  4. View logs: ${colors.cyan}docker-compose logs -f${colors.reset}`);
    console.log(`  5. Visit: ${colors.cyan}http://localhost:9090/health${colors.reset}\n`);
  } else {
    console.log(`${colors.yellow}${colors.bright}⚠ Some checks did not pass${colors.reset}\n`);
    info('Please address the warnings above before starting your hub.');
    info('Re-run this script after making changes: npm run hub:setup\n');
    process.exit(1);
  }
}

// Run the setup
main().catch((err) => {
  error(`Setup failed: ${err.message}`);
  process.exit(1);
});

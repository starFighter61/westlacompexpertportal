#!/usr/bin/env node

/**
 * MongoDB Atlas Cluster Migration Script
 *
 * This script helps migrate data from a dedicated MongoDB Atlas cluster (M10+)
 * to a free tier (M0) or Flex tier cluster using mongodump and mongorestore.
 *
 * Prerequisites:
 * - mongodump and mongorestore installed (typically included with MongoDB CLI tools)
 * - Access to the source (dedicated) cluster
 * - Access to the target (free/Flex) cluster
 * - Ensure you have the connection strings for both clusters
 *
 * Important Considerations:
 * - Free/M0 limits: 100 ops/sec, 0.5 GB storage, no backups, no sharding, etc.
 * - Flex limits: 500 ops/sec, 5 GB storage, capped features
 * - Security features like private endpoints, VPC peering not supported on free/Flex
 * - Monitoring and logging capabilities are limited
 *
 * Usage:
 * node migration-script.js "<source-connection-string>" "<target-connection-string>"
 *
 * Example:
 * node migration-script.js "mongodb+srv://user:pass@source-cluster.mongodb.net" "mongodb+srv://user:pass@target-cluster.mongodb.net"
 */

// Determine platform and set mongodump/mongorestore paths
const path = require('path');
const url = require('url');
const isWindows = process.platform === 'win32';
const toolsDir = path.join(process.cwd(), 'mongodb-database-tools-windows-x86_64-100.9.4', 'bin');
const mongodumpCmd = isWindows ? path.join(toolsDir, 'mongodump.exe') : 'mongodump';
const mongorestoreCmd = isWindows ? path.join(toolsDir, 'mongorestore.exe') : 'mongorestore';

const { spawn } = require('child_process');

// Configuration - passed as command line arguments
const SOURCE_CONNECTION_STRING = process.argv[2]; // First argument: source dedicated cluster connection string
const TARGET_CONNECTION_STRING = process.argv[3]; // Second argument: target free/Flex cluster connection string

// Temporary directory for dump (optional, defaults to /tmp on Unix, %TEMP% on Windows)
const DUMP_DIR = './mongodb-dump';

// Function to encode special characters in connection string user info
function encodeConnectionString(uri) {
  const atIndex = uri.indexOf('@');
  if (atIndex === -1) return uri; // If no @, assume no auth, or handle differently
  const protocolEnd = uri.indexOf('://') + 3;
  const auth = uri.substring(protocolEnd, atIndex);
  const rest = uri.substring(atIndex);
  const colonIndex = auth.indexOf(':');
  const user = colonIndex !== -1 ? auth.substring(0, colonIndex) : auth;
  const pass = colonIndex !== -1 ? auth.substring(colonIndex + 1) : '';
  const encodedUser = encodeURIComponent(user);
  const encodedPass = encodeURIComponent(pass);
  const encodedAuth = encodedUser + (encodedPass ? ':' + encodedPass : '');
  return uri.substring(0, protocolEnd) + encodedAuth + rest;
}

// Validation function
function validateConfiguration() {
  if (!SOURCE_CONNECTION_STRING) {
    console.error('❌ Source connection string is required.');
    console.error('Usage: node migration-script.js "<source-connection-string>" "<target-connection-string>"');
    process.exit(1);
  }

  if (!TARGET_CONNECTION_STRING) {
    console.error('❌ Target connection string is required.');
    console.error('Usage: node migration-script.js "<source-connection-string>" "<target-connection-string>"');
    process.exit(1);
  }

  // Basic validation for connection strings
  if (!SOURCE_CONNECTION_STRING.startsWith('mongodb')) {
    console.error('❌ Invalid source connection string format. Must start with "mongodb".');
    process.exit(1);
  }

  if (!TARGET_CONNECTION_STRING.startsWith('mongodb')) {
    console.error('❌ Invalid target connection string format. Must start with "mongodb".');
    process.exit(1);
  }
}

// Step 1: Dump data from source cluster
function dumpData() {
  console.log('Step 1: Starting data dump from source cluster...');

  const encodedSourceUri = encodeConnectionString(SOURCE_CONNECTION_STRING);

  const mongodump = spawn(mongodumpCmd, [
    `--uri=${encodedSourceUri}`,
    `--out=${DUMP_DIR}`
  ], { stdio: 'inherit' });

  mongodump.on('close', (code) => {
    if (code === 0) {
      console.log('✅ Data dump completed successfully.');
      restoreData();
    } else {
      console.error(`❌ Data dump failed with exit code ${code}. Please check your connection and permissions.`);
      process.exit(1);
    }
  });

  mongodump.on('error', (err) => {
    console.error('❌ Error running mongodump:', err.message);
    console.error('Make sure mongodump is installed and available in PATH.');
    process.exit(1);
  });
}

// Step 2: Restore data to target cluster
function restoreData() {
  console.log('Step 2: Starting data restore to target cluster...');

  const encodedTargetUri = encodeConnectionString(TARGET_CONNECTION_STRING);

  const mongorestore = spawn(mongorestoreCmd, [
    `--uri=${encodedTargetUri}`,
    `--dir=${DUMP_DIR}`
    // --drop is not included by default; add if you want to drop target collections first
    // '--drop'
  ], { stdio: 'inherit' });

  mongorestore.on('close', (code) => {
    if (code === 0) {
      console.log('✅ Data migration completed successfully!');
      console.log('⚠️  Important next steps:');
      console.log('   1. Verify data in your new free/Flex cluster');
      console.log('   2. Update your application connection strings');
      console.log('   3. Terminate your dedicated cluster (M10+)');
      console.log('   4. Note: Terminating will delete backup snapshots');
    } else {
      console.error(`❌ Data restore failed with exit code ${code}. Please check your connection and permissions.`);
    }
  });

  mongorestore.on('error', (err) => {
    console.error('❌ Error running mongorestore:', err.message);
    console.error('Make sure mongorestore is installed and available in PATH.');
  });
}

// Main execution
console.log('🚀 MongoDB Atlas Cluster Migration Script');
console.log('==========================================');
console.log('This script will migrate your data from dedicated to free/Flex tier.\n');

console.log('⚠️  Before proceeding:');
console.log('   - Ensure both clusters are created and accessible');
console.log('   - Check the Atlas console for connection strings and IPs');
console.log('   - Review limitations: https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/');
console.log('   - M0: 100 ops/sec, 0.5 GB storage');
console.log('   - F2 (Flex tier): 500 ops/sec, 5 GB storage\n');

// Validate configuration
validateConfiguration();

// Start the migration process
dumpData();

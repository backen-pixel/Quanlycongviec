const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

// Only the credentials needed for authenticated read projections are imported
// into Founder-local. This prevents unrelated integration settings from a
// standard runtime environment from activating inside the private profile.
const FOUNDER_LOCAL_DATA_ENV_KEYS = Object.freeze([
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'JWT_SECRET',
]);

const FOUNDER_LOCAL_SYSTEM_ENV_KEYS = Object.freeze([
  'COMSPEC',
  'LANG',
  'LC_ALL',
  'PATH',
  'PATHEXT',
  'SYSTEMDRIVE',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'TZ',
  'WINDIR',
]);

function loadFounderLocalDataEnvironment(file, {
  env = process.env,
  readFile = (target) => fs.readFileSync(target),
} = {}) {
  const selected = String(file || '').trim();
  if (!selected || !path.isAbsolute(selected)) {
    const error = new Error('Founder-local requires an explicit absolute environment file.');
    error.code = 'FOUNDER_LOCAL_ENV_FILE_REQUIRED';
    throw error;
  }

  let parsed;
  try {
    parsed = dotenv.parse(readFile(path.resolve(selected)));
  } catch {
    const error = new Error('Founder-local environment file is unreadable.');
    error.code = 'FOUNDER_LOCAL_ENV_FILE_UNREADABLE';
    throw error;
  }

  for (const key of FOUNDER_LOCAL_DATA_ENV_KEYS) {
    delete env[key];
    if (Object.prototype.hasOwnProperty.call(parsed, key)) env[key] = parsed[key];
  }

  return {
    loaded_keys: FOUNDER_LOCAL_DATA_ENV_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(parsed, key)),
    unrelated_keys_ignored: Object.keys(parsed).filter((key) => !FOUNDER_LOCAL_DATA_ENV_KEYS.includes(key)).length,
  };
}

function buildFounderLocalChildEnvironment(env = process.env, {
  additionalKeys = [],
  includeDataKeys = true,
} = {}) {
  const allowed = new Set([
    ...FOUNDER_LOCAL_SYSTEM_ENV_KEYS,
    ...(includeDataKeys ? FOUNDER_LOCAL_DATA_ENV_KEYS : []),
    ...additionalKeys,
  ].map((key) => String(key).toUpperCase()));
  const isolated = {};
  for (const [key, value] of Object.entries(env || {})) {
    if (allowed.has(String(key).toUpperCase()) && value != null) isolated[key] = String(value);
  }
  return isolated;
}

module.exports = {
  FOUNDER_LOCAL_DATA_ENV_KEYS,
  FOUNDER_LOCAL_SYSTEM_ENV_KEYS,
  buildFounderLocalChildEnvironment,
  loadFounderLocalDataEnvironment,
};

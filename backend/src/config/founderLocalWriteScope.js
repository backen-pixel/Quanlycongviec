function advisoryConfigurationEnabled(env = process.env) {
  return env.FOUNDER_ADVISORY_CONFIG_ENABLED === '1';
}

module.exports = {
  advisoryConfigurationEnabled,
};

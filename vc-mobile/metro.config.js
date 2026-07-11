const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const mobileShared = path.resolve(projectRoot, '../mobile-shared');
const nodeModules = path.resolve(projectRoot, 'node_modules');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [mobileShared];
config.resolver.extraNodeModules = new Proxy(
  {},
  {
    get: (_, name) => path.join(nodeModules, String(name)),
  },
);

module.exports = config;

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

/** Chỉ giữ font Ionicons — các bộ icon khác (~2MB) không dùng. */
const unusedIconFont = /(?:@expo[\\/]vector-icons|react-native-vector-icons).+[\\/]Fonts[\\/](?!Ionicons\.ttf$).+\.ttf$/;
const prevBlock = config.resolver.blockList;
config.resolver.blockList = [unusedIconFont].concat(
  Array.isArray(prevBlock) ? prevBlock : prevBlock ? [prevBlock] : [],
);

config.transformer = config.transformer || {};
config.transformer.minifierConfig = {
  ...(config.transformer.minifierConfig || {}),
  compress: {
    ...((config.transformer.minifierConfig && config.transformer.minifierConfig.compress) || {}),
    drop_console: true,
  },
};

module.exports = config;

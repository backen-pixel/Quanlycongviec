'use strict';

class AgentControlPlaneError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AgentControlPlaneError';
    this.code = code;
    this.details = details;
  }
}

function controlPlaneError(code, message, details = {}) {
  return new AgentControlPlaneError(code, message, details);
}

module.exports = {
  AgentControlPlaneError,
  controlPlaneError,
};

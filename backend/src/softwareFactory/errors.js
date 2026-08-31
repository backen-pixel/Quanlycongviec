class SoftwareFactoryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SoftwareFactoryError';
    this.code = code;
    this.details = details;
  }
}

function factoryError(code, message, details = {}) {
  return new SoftwareFactoryError(code, message, details);
}

module.exports = {
  SoftwareFactoryError,
  factoryError,
};


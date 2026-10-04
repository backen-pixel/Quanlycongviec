'use strict';

// Track returned handler promises rather than response.finish: a webhook may
// acknowledge its receipt before its handler finishes processing the event.
function trackRouterHandlers(router, work) {
  function wrap(handler) {
    if (Array.isArray(handler)) return handler.map(wrap);
    if (typeof handler !== 'function') return handler;
    // Child routers must instrument their own handlers when constructed. The
    // Router function itself does not return promises from nested handlers.
    if (Array.isArray(handler.stack)) return handler;
    if (handler.length === 4) return function trackedError(error, req, res, next) {
      return work.run(() => handler.call(this, error, req, res, next)).catch(next);
    };
    return function trackedHandler(req, res, next) {
      return work.run(() => handler.call(this, req, res, next)).catch(next);
    };
  }
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all']) {
    const register = router[method];
    router[method] = function trackedRegistration(path, ...handlers) { return register.call(this, path, ...handlers.map(wrap)); };
  }
  if (typeof router.use === 'function') {
    const register = router.use;
    router.use = function trackedUse(...args) { return register.apply(this, args.map(wrap)); };
  }
  return router;
}
module.exports = { trackRouterHandlers };

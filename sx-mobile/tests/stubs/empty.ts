/** Stub rỗng cho các native module không dùng trong test logic. */
const handler: ProxyHandler<Record<string, unknown>> = {
  get: () => async () => undefined,
};
const stub = new Proxy({}, handler);
export default stub;

/** Stub AsyncStorage in-memory. */
const mem = new Map<string, string>();
export default {
  getItem: async (k: string) => mem.get(k) ?? null,
  setItem: async (k: string, v: string) => { mem.set(k, v); },
  removeItem: async (k: string) => { mem.delete(k); },
  multiRemove: async (ks: string[]) => { ks.forEach((k) => mem.delete(k)); },
  getAllKeys: async () => [...mem.keys()],
};

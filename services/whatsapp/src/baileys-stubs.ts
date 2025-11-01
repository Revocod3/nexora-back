// Temporary Baileys stubs (remove once real dependency installed)
export async function useMultiFileAuthState(): Promise<{
  state: unknown;
  saveCreds: () => void | Promise<void>;
}> {
  return { state: {}, saveCreds: () => {} };
}
export default function makeWASocket(): {
  ev: { on: (event: string, cb: (ev: unknown) => void) => void };
  logout: () => Promise<void>;
} {
  return {
    ev: { on: () => {} },
    logout: async () => {},
  };
}

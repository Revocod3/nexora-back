// Minimal Baileys stubs (replace with real types when dependency added)
declare module 'baileys' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function useMultiFileAuthState(dir: string): Promise<{
    state: unknown;
    saveCreds: () => void | Promise<void>;
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export default function makeWASocket(opts: any): {
    ev: { on: (event: string, cb: (ev: unknown) => void) => void };
    logout: () => Promise<void>;
  };
}

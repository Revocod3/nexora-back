// Minimal ambient declaration for 'qrcode' used dynamically
declare module 'qrcode' {
  // Very loose types – we only call toString
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function toString(text: string, opts: any, cb: (err: any, out: string) => void): void;
}

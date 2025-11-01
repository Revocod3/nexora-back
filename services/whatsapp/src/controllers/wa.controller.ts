import { Body, Controller, Get, Headers, HttpException, HttpStatus, Post } from '@nestjs/common';
import { WhatsappService } from '../services/whatsapp.service.js';
import { WhatsappConfigService } from '../config/config.js';

@Controller('wa')
export class WAController {
  constructor(
    private readonly svc: WhatsappService,
    private readonly cfg: WhatsappConfigService,
  ) { }

  private assertInternal(key?: string) {
    const env = this.cfg.get();
    if (process.env.NODE_ENV === 'development' || !env.WA_INTERNAL_SHARED_KEY) return;
    if (key !== env.WA_INTERNAL_SHARED_KEY) {
      throw new HttpException('forbidden', HttpStatus.FORBIDDEN);
    }
  }

  @Get('qr')
  qr(@Headers('x-internal-key') internalKey?: string) {
    return this.getQrState(internalKey);
  }

  @Post('pair')
  async requestPairingCode(
    @Body() body: { phoneNumber: string },
    @Headers('x-internal-key') internalKey?: string,
  ) {
    this.assertInternal(internalKey);
    if (!body?.phoneNumber) {
      throw new HttpException('phoneNumber required', HttpStatus.BAD_REQUEST);
    }
    try {
      const code = await this.svc.requestPairingCode(body.phoneNumber);
      return { ok: true, code, phoneNumber: body.phoneNumber };
    } catch (e) {
      throw new HttpException(
        { ok: false, error: (e as Error).message },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private getQrState(internalKey?: string) {
    const env = this.cfg.get();
    if (
      process.env.NODE_ENV !== 'development' &&
      env.WA_INTERNAL_SHARED_KEY &&
      internalKey !== env.WA_INTERNAL_SHARED_KEY
    ) {
      return { status: 'forbidden', qr: null, error: 'forbidden' };
    }
    const status = this.svc.getConnectionState();
    const qr = this.svc.getLastQr();
    return { status, qr: qr || null };
  }

  @Get('ping')
  ping() {
    return { ok: true };
  }

  @Get('qr_ascii')
  async qrAscii(@Headers('x-internal-key') internalKey?: string) {
    const env = this.cfg.get();
    if (
      process.env.NODE_ENV !== 'development' &&
      env.WA_INTERNAL_SHARED_KEY &&
      internalKey !== env.WA_INTERNAL_SHARED_KEY
    ) {
      return { status: 'forbidden', ascii: null, error: 'forbidden' };
    }
    const qr = this.svc.getLastQr();
    if (!qr) return { status: this.svc.getConnectionState(), ascii: null };
    try {
      // Prefer qrcode-terminal for small ASCII, fallback to qrcode
      const mod = (await import('qrcode-terminal')) as unknown as {
        generate?: (qr: string, opts: { small?: boolean }, cb: (out: string) => void) => void;
      };
      const gen = mod.generate;
      if (typeof gen === 'function') {
        const ascii = await new Promise<string>((resolve) => {
          gen(qr, { small: true }, (out: string) => resolve(out));
        });
        return { status: this.svc.getConnectionState(), ascii };
      }
    } catch { }
    try {
      const qrmod = (await import('qrcode')) as unknown as {
        toString: (data: string, opts: { type: 'terminal'; small?: boolean }) => Promise<string>;
      };
      const ascii = await qrmod.toString(qr, { type: 'terminal', small: true });
      return { status: this.svc.getConnectionState(), ascii };
    } catch {
      return { status: this.svc.getConnectionState(), ascii: null, error: 'render_failed' };
    }
  }

  @Post('send')
  async send(
    @Body() body: { jid?: string; to?: string; text?: string },
    @Headers('x-internal-key') internalKey?: string,
  ) {
    this.assertInternal(internalKey);
    if (!body?.text) throw new HttpException('text required', HttpStatus.BAD_REQUEST);
    const target = body.jid
      ? body.jid
      : body.to
        ? body.to.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
        : null;
    if (!target) throw new HttpException('jid or to required', HttpStatus.BAD_REQUEST);
    try {
      const res = await this.svc.sendText(target, body.text);
      return { ok: true, ...res };
    } catch (e) {
      throw new HttpException(
        { ok: false, error: (e as Error).message },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Post('reset')
  async reset(@Headers('x-internal-key') internalKey?: string) {
    this.assertInternal(internalKey);
    return await this.svc.resetAuthDir();
  }
}

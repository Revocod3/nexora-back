import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ElevenLabsClient, stream } from 'elevenlabs';
import { Readable } from 'stream';

@Injectable()
export class ElevenLabsService {
  private readonly logger = new Logger(ElevenLabsService.name);
  private client: ElevenLabsClient;
  private voiceId: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('ELEVENLABS_API_KEY');
    this.voiceId = this.configService.get<string>('ELEVENLABS_VOICE_ID', 'h2cd3gvcqTp3m65Dysk7');

    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY is required');
    }

    this.client = new ElevenLabsClient({ apiKey });
    this.logger.log(`ElevenLabs service initialized with voice ID: ${this.voiceId}`);
  }

  /**
   * Generate speech from text using ElevenLabs TTS
   * Returns a readable stream of audio data
   */
  async textToSpeech(text: string, options?: {
    voiceId?: string;
    modelId?: string;
    stability?: number;
    similarityBoost?: number;
  }): Promise<Readable> {
    try {
      const voiceId = options?.voiceId || this.voiceId;

      this.logger.debug(`Generating speech for text: "${text.substring(0, 50)}..."`);

      const audio = await this.client.generate({
        voice: voiceId,
        text,
        model_id: options?.modelId || 'eleven_multilingual_v2',
        voice_settings: {
          stability: options?.stability ?? 0.5,
          similarity_boost: options?.similarityBoost ?? 0.75,
        },
      });

      // Convert the audio stream to a readable stream
      const audioStream = Readable.from(audio);

      return audioStream;
    } catch (error: any) {
      this.logger.error(`Error generating speech: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Generate speech and return as buffer
   */
  async textToSpeechBuffer(text: string): Promise<Buffer> {
    try {
      const audioStream = await this.textToSpeech(text);
      const chunks: Buffer[] = [];

      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk));
      }

      return Buffer.concat(chunks);
    } catch (error: any) {
      this.logger.error(`Error generating speech buffer: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get available voices from ElevenLabs
   */
  async getVoices() {
    try {
      const response = await this.client.voices.getAll();
      return response.voices;
    } catch (error: any) {
      this.logger.error(`Error fetching voices: ${error.message}`);
      throw error;
    }
  }
}

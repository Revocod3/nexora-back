/**
 * Audio Converter Utility
 *
 * Converts audio between different formats:
 * - mulaw (8kHz, 8-bit) - Used by Twilio Media Streams
 * - PCM16 (24kHz, 16-bit) - Used by OpenAI Realtime API
 */

// mulaw compression table
const MULAW_BIAS = 0x84;
const MULAW_MAX = 0x1fff;
const MULAW_SEG_SHIFT = 4;
const MULAW_SEG_MASK = 0x70;
const MULAW_SIGN_BIT = 0x80;

/**
 * Converts mulaw encoded audio to PCM16
 * @param mulawData Buffer containing mulaw audio data
 * @returns Buffer containing PCM16 audio data
 */
export function mulawToPcm16(mulawData: Buffer): Buffer {
  const pcmData = Buffer.alloc(mulawData.length * 2);

  for (let i = 0; i < mulawData.length; i++) {
    const mulaw = mulawData[i];

    // Invert bits
    const mulawInverted = ~mulaw;

    // Extract sign, exponent, and mantissa
    const sign = mulawInverted & MULAW_SIGN_BIT;
    const exponent = (mulawInverted & MULAW_SEG_MASK) >> MULAW_SEG_SHIFT;
    const mantissa = mulawInverted & 0x0f;

    // Calculate linear value
    let sample = ((mantissa << 3) + MULAW_BIAS) << exponent;
    sample -= MULAW_BIAS;

    // Apply sign
    if (sign === 0) {
      sample = -sample;
    }

    // Write 16-bit little-endian PCM
    pcmData.writeInt16LE(sample, i * 2);
  }

  return pcmData;
}

/**
 * Converts PCM16 audio to mulaw encoded audio
 * @param pcm16Data Buffer containing PCM16 audio data
 * @returns Buffer containing mulaw audio data
 */
export function pcm16ToMulaw(pcm16Data: Buffer): Buffer {
  const mulawData = Buffer.alloc(pcm16Data.length / 2);

  for (let i = 0; i < mulawData.length; i++) {
    const sample = pcm16Data.readInt16LE(i * 2);

    // Get the sign and the magnitude
    let sign = (sample >> 8) & MULAW_SIGN_BIT;
    let magnitude = sample < 0 ? -sample : sample;

    // Clip the magnitude
    if (magnitude > MULAW_MAX) {
      magnitude = MULAW_MAX;
    }

    // Add bias
    magnitude += MULAW_BIAS;

    // Find the exponent
    let exponent = 7;
    for (let exp = 0; exp < 8; exp++) {
      if (magnitude <= (0x1f << (exp + 3))) {
        exponent = exp;
        break;
      }
    }

    // Extract mantissa
    const mantissa = (magnitude >> (exponent + 3)) & 0x0f;

    // Combine sign, exponent, and mantissa
    let mulaw = sign | (exponent << MULAW_SEG_SHIFT) | mantissa;

    // Invert bits (mulaw convention)
    mulaw = ~mulaw;

    mulawData[i] = mulaw;
  }

  return mulawData;
}

/**
 * Resamples PCM16 audio from one sample rate to another
 * Simple linear interpolation resampler
 *
 * @param pcmData Buffer containing PCM16 audio data
 * @param fromRate Original sample rate (e.g., 8000)
 * @param toRate Target sample rate (e.g., 24000)
 * @returns Buffer containing resampled PCM16 audio data
 */
export function resamplePcm16(
  pcmData: Buffer,
  fromRate: number,
  toRate: number,
): Buffer {
  if (fromRate === toRate) {
    return pcmData;
  }

  const samplesIn = pcmData.length / 2;
  const samplesOut = Math.floor((samplesIn * toRate) / fromRate);
  const outputBuffer = Buffer.alloc(samplesOut * 2);

  for (let i = 0; i < samplesOut; i++) {
    const srcIndex = (i * fromRate) / toRate;
    const index1 = Math.floor(srcIndex);
    const index2 = Math.min(index1 + 1, samplesIn - 1);
    const fraction = srcIndex - index1;

    const sample1 = pcmData.readInt16LE(index1 * 2);
    const sample2 = pcmData.readInt16LE(index2 * 2);

    // Linear interpolation
    const interpolated = Math.round(
      sample1 + (sample2 - sample1) * fraction,
    );

    outputBuffer.writeInt16LE(interpolated, i * 2);
  }

  return outputBuffer;
}

/**
 * Converts Twilio mulaw (8kHz) to OpenAI PCM16 (24kHz)
 * @param twilioMulaw Buffer containing mulaw audio from Twilio
 * @returns Buffer containing PCM16 audio for OpenAI (24kHz)
 */
export function twilioToOpenAI(twilioMulaw: Buffer): Buffer {
  // Step 1: Convert mulaw to PCM16 (8kHz)
  const pcm8k = mulawToPcm16(twilioMulaw);

  // Step 2: Resample from 8kHz to 24kHz
  const pcm24k = resamplePcm16(pcm8k, 8000, 24000);

  return pcm24k;
}

/**
 * Converts OpenAI PCM16 (24kHz) to Twilio mulaw (8kHz)
 * @param openAiPcm Buffer containing PCM16 audio from OpenAI (24kHz)
 * @returns Buffer containing mulaw audio for Twilio
 */
export function openAIToTwilio(openAiPcm: Buffer): Buffer {
  // Step 1: Resample from 24kHz to 8kHz
  const pcm8k = resamplePcm16(openAiPcm, 24000, 8000);

  // Step 2: Convert PCM16 to mulaw
  const mulaw = pcm16ToMulaw(pcm8k);

  return mulaw;
}

/**
 * Encodes PCM16 audio to base64 for transmission
 * @param pcmData Buffer containing PCM16 audio data
 * @returns Base64 encoded string
 */
export function encodePcm16ToBase64(pcmData: Buffer): string {
  return pcmData.toString('base64');
}

/**
 * Decodes base64 audio to PCM16 buffer
 * @param base64Data Base64 encoded audio string
 * @returns Buffer containing PCM16 audio data
 */
export function decodeBase64ToPcm16(base64Data: string): Buffer {
  return Buffer.from(base64Data, 'base64');
}

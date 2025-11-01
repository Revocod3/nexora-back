// Simple JID debugging utilities for WhatsApp connector
// Simplified for MVP - basic logging without complex logic

export function logJidTransformation(
  tenantId: string,
  component: string,
  originalJid: string,
  transformedJid: string,
  transformationType: string,
  metadata?: any
) {
  console.log(`[JID-DEBUG] ${tenantId}:${component} - ${transformationType}: ${originalJid} -> ${transformedJid}`, metadata || {});
}

export function debugBaileysMessage(
  tenantId: string,
  direction: 'inbound' | 'outbound',
  message: any,
  metadata?: any
) {
  console.log(`[BAILEYS-DEBUG] ${tenantId}:${direction} - Message:`, {
    key: message.key,
    messageType: message.message ? Object.keys(message.message)[0] : 'unknown',
    ...metadata
  });
}

export function compareJidsForThreadConsistency(
  tenantId: string,
  jid1: string,
  jid2: string,
  context: string
): boolean {
  // Simple comparison - in MVP we just check if they're equal
  const areEqual = jid1 === jid2;
  console.log(`[JID-COMPARE] ${tenantId}:${context} - ${jid1} vs ${jid2} = ${areEqual}`);
  return areEqual;
}
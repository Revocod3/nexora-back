// Simplified bus - for MVP we'll use direct HTTP calls instead
// This is just a stub to make the code compile

export interface BusMessage<T = any> {
  data: T;
  topic: string;
}

export type BusTopic = 'inbound.messages' | 'outbound.messages' | string;

export const publish = async (topic: BusTopic, data: any) => {
  console.log(`[BUS] Publishing to ${topic}:`, data);
  // For MVP: no-op, we'll use direct HTTP calls
};

export const startConsumer = (topic: BusTopic, handler: (msg: BusMessage) => Promise<void>) => {
  console.log(`[BUS] Consumer registered for ${topic}`);
  // For MVP: no-op
};

export const consume = startConsumer;

export const resetInMemoryBus = () => {
  // For tests
};

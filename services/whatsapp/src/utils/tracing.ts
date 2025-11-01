// Simple tracing stub (for future implementation)
export const initTracing = (config: { serviceName: string; disabled?: boolean }) => {
  if (!config.disabled) {
    console.log(`[TRACING] Initialized for ${config.serviceName} (stub)`);
  }
  return {
    shutdown: async () => {
      // No-op for now
    }
  };
};

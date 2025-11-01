// Simplified tracing - stub for MVP
export const initTracing = (config: { serviceName: string; disabled?: boolean }) => {
  console.log(`[TRACING] Initialized for ${config.serviceName} (disabled in MVP)`);
  return {
    shutdown: async () => {
      console.log(`[TRACING] Shutdown ${config.serviceName}`);
    }
  };
};

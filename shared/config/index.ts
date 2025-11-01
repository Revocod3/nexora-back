// Simple config loader
export const loadOrchestratorEnv = () => {
  return {
    port: parseInt(process.env.WHATSAPP_PORT || '3011'),
    nodeEnv: process.env.NODE_ENV || 'development',
  };
};

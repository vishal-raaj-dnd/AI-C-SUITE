const isProduction = (import.meta as any).env.PROD;

export const API_BASE = isProduction
  ? 'https://ai-c-suite.onrender.com'
  : '';

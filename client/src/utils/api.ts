const isProduction = import.meta.env.PROD;

export const API_BASE = isProduction
  ? 'https://ai-c-suite.onrender.com'
  : '';

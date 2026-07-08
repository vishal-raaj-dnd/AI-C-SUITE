const envApiUrl = (import.meta as any).env.VITE_API_URL;

export const API_BASE = typeof envApiUrl === 'string' && envApiUrl.trim().length > 0
  ? envApiUrl.trim()
  : '';

export const COOKIES = {
  ACCESS: 'ats_at',
  REFRESH: 'ats_rt',
} as const;

export const JWT_AUD = {
  WEB: 'web',
  SOCKET: 'socket',
} as const;

export const ALLOWED_UPLOAD_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
export const RESET_TOKEN_TTL_MIN = 30;
export const SOCKET_TOKEN_TTL = '5m';
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

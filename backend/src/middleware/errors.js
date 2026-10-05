export function notFound(req, res) {
  res.status(404).json({ success: false, message: 'Route not found', code: 'NOT_FOUND' });
}

const SAFE_CODES = new Set(['ENV_MISSING', 'SUPABASE_SERVICE_ROLE_MISSING']);

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err?.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'Request body is too large', code: 'PAYLOAD_TOO_LARGE' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Malformed JSON body', code: 'BAD_JSON' });
  if (err?.code === '22P02') return res.status(400).json({ success: false, message: 'Invalid identifier', code: 'BAD_ID' });
  if (err?.code === '23503') return res.status(409).json({ success: false, message: 'Related record not found', code: 'FK_VIOLATION' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  const expose = status < 500 || SAFE_CODES.has(err.code);
  res.status(status).json({
    success: false,
    message: expose ? err.message : 'Internal server error',
    code: err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR'),
  });
}

export const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });

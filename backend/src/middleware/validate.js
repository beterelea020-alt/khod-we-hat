export const validate = schema => (req, res, next) => {
  const r = schema.safeParse(req.body ?? {});
  if (!r.success) return res.status(400).json({ success: false, message: 'Validation failed', code: 'VALIDATION_ERROR', errors: r.error.flatten() });
  req.body = r.data;
  next();
};

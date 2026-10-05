import { getSetting } from '../services/settings.js';

export const requireFeature = key => async (_req, res, next) => {
  try {
    if (!(await getSetting(key))) return res.status(403).json({ success: false, message: 'هذه الخاصية متوقفة مؤقتًا من إدارة المنصة', code: 'FEATURE_DISABLED', feature: key });
    next();
  } catch (e) { next(e); }
};

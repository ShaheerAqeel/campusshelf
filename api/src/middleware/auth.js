import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { forbidden, unauthorized } from '../errors.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role, name: user.name }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
    issuer: 'campusshelf',
  });
}

/** Requires a valid Bearer token and sets req.user = { id, role, name }. */
export function requireAuth(req, _res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, { issuer: 'campusshelf' });
    req.user = { id: Number(payload.sub), role: payload.role, name: payload.name };
    return next();
  } catch {
    return next(unauthorized('Invalid or expired token'));
  }
}

/** Use after requireAuth. */
export function requireRole(...roles) {
  return (req, _res, next) => (roles.includes(req.user?.role) ? next() : next(forbidden()));
}

export const STAFF = ['librarian', 'admin'];

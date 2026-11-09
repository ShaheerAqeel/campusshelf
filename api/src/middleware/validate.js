import { badRequest } from '../errors.js';

/** Parse req[source] with a zod schema; replaces it with the parsed value. */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(badRequest('Validation failed', details));
    }
    // Express 5 makes req.query a getter, so store parsed values separately.
    req.valid = { ...(req.valid || {}), [source]: result.data };
    return next();
  };
}

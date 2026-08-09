'use strict';

const { runSchema } = require('../utils/validate');

// مصنع Middleware للتحقّق من جسم الطلب وفق مخطّط.
// عند وجود أخطاء يردّ 400 مع تفصيلها.
function validateBody(schema) {
  return (req, res, next) => {
    const errors = runSchema(schema, req.body || {});
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ message: 'بيانات غير صالحة', errors });
    }
    next();
  };
}

module.exports = { validateBody };

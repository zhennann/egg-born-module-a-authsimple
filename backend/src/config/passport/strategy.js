const passport = require('passport-strategy');
const util = require('util');

function Strategy(options, verify) {
  if (typeof options === 'function') {
    verify = options;
    options = {};
  }
  if (!verify) { throw new TypeError('LocalStrategy requires a verify callback'); }

  passport.Strategy.call(this);
  this.name = 'simple';
  this._verify = verify;
  this._passReqToCallback = options.passReqToCallback;
}

/**
 * Inherit from `passport.Strategy`.
 */
util.inherits(Strategy, passport.Strategy);

Strategy.prototype.authenticate = function(req) {
  // self
  const self = this;

  // check
  if (req.method === 'GET') {
    if (req.query.state === 'associate') {
      // goto signup
      const url = req.ctx.meta.base.getAbsoluteUrl('/a/authsimple/signup?state=associate');
      return req.ctx.redirect(url);
    }
    // not allow
    return self.error(req.ctx.parseFail(403));
  }

  // verified
  function verified(err, user, info) {
    if (err) { return self.error(err); }
    if (!user) { return self.fail(info); }
    req.ctx.success(user);
    self.success(user, info);
  }

  try {
    if (self._passReqToCallback) {
      this._verify(req, req.body, verified);
    } else {
      this._verify(req.body, verified);
    }
  } catch (ex) {
    return self.error(ex);
  }
};

module.exports = Strategy;

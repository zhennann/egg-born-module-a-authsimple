const util = require('util');
const passwordFn = require('password-hash-and-salt'); // should compile
const require3 = require('require3');
const uuid = require3('uuid');

module.exports = app => {
  class Auth extends app.Service {

    async signup({ userName, realName, email, mobile, password }) {
      // signup
      const userId = await this.ctx.meta.user.signup({
        userName,
        realName,
        email,
        // mobile, // not use mobile
      });
      // add auth record
      await this.add({ userId, password });
      // login now
      const user = await this.signin({ auth: email, password, rememberMe: false });
      // ok
      return user;
    }

    async signin({ auth, password, rememberMe }) {
      try {
        const res = await this.ctx.performAction({
          method: 'post',
          url: 'passport/a-authsimple/authsimple',
          body: { auth, password, rememberMe },
        });
        return res;
      } catch (err) {
        const error = new Error();
        error.code = err.code;
        error.message = err.message;
        throw error;
      }
    }

    async add({ userId, password }) {
      password = password || this.ctx.config.defaultPassword;
      const hash = await this._calcPassword({ password });
      // auth simple
      await this.ctx.model.authSimple.insert({
        userId,
        hash,
      });
      // auth
      const info = this.ctx.module.info;
      const providerItem = await this.ctx.meta.user.getAuthProvider({
        module: info.relativeName,
        providerName: info.name,
      });
      await this.ctx.model.auth.insert({
        userId,
        providerId: providerItem.id,
        profileId: userId,
        profile: JSON.stringify({
          userId,
          rememberMe: false,
        }),
      });
    }

    async verify({ userId, password }) {
      if (!password) return false;
      const auth = await this.ctx.model.authSimple.get({
        userId,
      });
      if (!auth) return false;
      return await this._verifyPassword({ password, hash: auth.hash });
    }

    async passwordChange({ passwordOld, passwordNew, userId }) {
      // verify old
      const res = await this.verify({ userId, password: passwordOld });
      if (!res) this.ctx.throw(403);
      // save new
      const auth = await this.ctx.model.authSimple.get({
        userId,
      });
      const hash = await this._calcPassword({ password: passwordNew });
      await this.ctx.model.authSimple.update({
        id: auth.id,
        hash,
      });
    }

    async emailConfirm({ email, user }) {
      // save email
      if (email !== user.email) {
        await this.ctx.meta.user.save({
          user: { id: user.id, email },
        });
      }
      // link
      const token = uuid.v4().replace(/-/g, '');
      const prefix = `${this.ctx.meta.base.protocol}://${this.ctx.meta.base.host}`;
      const link = `${prefix}/api/a/authsimple/auth/emailConfirmation?token=${token}`;
      // email scene
      const scene = (app.meta.isTest || app.meta.isLocal) ? 'test' : 'system';
      // email subject
      let subject = this.ctx.text('confirmationEmailSubject');
      subject = this.ctx.meta.util.replaceTemplate(subject, { siteName: this.ctx.instance.title });
      // email body
      let body = this.ctx.text('confirmationEmailBody');
      body = this.ctx.meta.util.replaceTemplate(body, {
        userName: user.userName,
        link,
        siteName: this.ctx.instance.title,
      });
      // send
      await this.ctx.meta.mail.send({
        scene,
        message: {
          to: email,
          subject,
          text: body,
        },
      });
      // save
      await this.ctx.cache.db.set(
        `emailConfirm:${token}`,
        { userId: user.id },
        this.ctx.config.confirmation.timeout
      );
    }

    // invoke by user clicking the link
    async emailConfirmation({ token }) {
      // token value
      const cacheKey = `emailConfirm:${token}`;
      const value = await this.ctx.cache.db.get(cacheKey);
      if (!value) {
        // expired, send confirmation mail again
        const data = {
          message: this.ctx.text('confirmationEmailExpired'),
          link: '/a/authsimple/emailConfirm',
          linkText: this.ctx.text('Resend confirmation email'),
        };
        const url = this.ctx.meta.base.getAlertUrl({ data });
        return this.ctx.redirect(url);
      }
      // userId
      const userId = value.userId;
      // activated
      await this.ctx.meta.user.setEmailConfirmed({ userId, emailConfirmed: 1 });
      // clear token
      await this.ctx.cache.db.remove(cacheKey);
      // not: login antomatically
      // ok
      const data = {
        message: this.ctx.text('confirmationEmailSucceeded'),
        link: '#back',
        linkText: this.ctx.text('Close'),
      };
      const url = this.ctx.meta.base.getAlertUrl({ data });
      return this.ctx.redirect(url);
    }

    async _calcPassword({ password }) {
      const _password = passwordFn(password.toString());
      const hashFn = util.promisify(_password.hash);
      return await hashFn.call(_password);
    }

    async _verifyPassword({ password, hash }) {
      const _password = passwordFn(password.toString());
      const verifyFn = util.promisify(_password.verifyAgainst);
      return await verifyFn.call(_password, hash);
    }

  }

  return Auth;
};


/**
 * Copyright (c) 2017-present, Parsec Labs (parseclabs.org)
 *
 * This source code is licensed under the GNU Affero General Public License,
 * version 3, found in the LICENSE file in the root directory of this source 
 * tree.
 */

import httpinvoke from 'httpinvoke';
import querystring from 'querystring';
import { BadRequest } from './errors';

const recaptchaUrl = 'https://www.google.com//recaptcha/api/siteverify';
const contentType = 'application/x-www-form-urlencoded';

function Recaptcha(secret) {
  this.secret = secret;
}

Recaptcha.prototype.verify = function verify(recapResponse, sourceIp) {
  return new Promise((fulfill, reject) => {
    const options = {
      input: querystring.stringify({
        response: recapResponse,
        secret: this.secret,
        remoteip: sourceIp,
      }),
      headers: {
        'Content-Type': contentType,
      },
      converters: {
        'text json': JSON.parse,
        'json text': JSON.stringify,
      },
      outputType: 'json',
    };
    return httpinvoke(recaptchaUrl, 'POST', options).then((res) => {
      if (!res.body.success) {
        return reject(new BadRequest(JSON.stringify(res.body)));
      }
      return fulfill();
    }, err => reject(new BadRequest(JSON.stringify(err))));
  });
};

module.exports = Recaptcha;


/**
 * Copyright (c) 2017-present, Parsec Labs (parseclabs.org)
 *
 * This source code is licensed under the GNU Affero General Public License,
 * version 3, found in the LICENSE file in the root directory of this source 
 * tree.
 */

class ExtendableError extends Error {
  constructor(message) {
    super();
    const prefix = this.constructor.name.replace(/([a-z](?=[A-Z]))/g, '$1 ');
    this.message = `${prefix}: ${message}`;
    this.errName = this.constructor.name;
  }
}

class Unauthorized extends ExtendableError {}

class Forbidden extends ExtendableError {}

class BadRequest extends ExtendableError {}

class NotFound extends ExtendableError {}

class Conflict extends ExtendableError {}

export { Unauthorized, NotFound, BadRequest, Forbidden, Conflict };

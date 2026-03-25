/**
 * Node 18 polyfill — provides global File class required by undici 7.x
 * (cheerio 1.2+ → undici 7+ dependency, File is only global in Node 20+)
 *
 * Usage: node --require ./scripts/polyfill-node18.cjs scripts/migrate_news.js
 */
'use strict';

if (typeof global.File === 'undefined') {
  global.File = class File extends Blob {
    constructor(parts, name, options = {}) {
      super(parts, options);
      this.name = name;
      this.lastModified = options.lastModified ?? Date.now();
    }
  };
}

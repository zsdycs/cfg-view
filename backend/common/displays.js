/**
 * cfg-view 画面数据访问（读取 frontend/public/displays 下的画面 JSON 与符号库）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const config = require('../config');

class DisplayStore {
  constructor(dir) {
    this._dir = dir || config.displaysDir;
  }

  dir() {
    return this._dir;
  }

  list() {
    if (!fs.existsSync(this._dir)) return [];
    return fs.readdirSync(this._dir)
      .filter((f) => /\.json$/i.test(f) && !/\.symbols\.json$/.test(f))
      .sort()
      .map((f) => ({
        name: f.replace(/\.json$/i, ''),
        file: f,
        hasSymbols: fs.existsSync(path.join(this._dir, f.replace(/\.json$/i, '.symbols.json'))),
      }));
  }

  load(name) {
    const f = path.join(this._dir, name.replace(/\.\./g, '') + '.json');
    if (!fs.existsSync(f)) return null;
    try {
      return JSON.parse(fs.readFileSync(f, 'utf-8'));
    } catch (e) {
      return null;
    }
  }

  loadSymbols(name) {
    const f = path.join(this._dir, name.replace(/\.\./g, '') + '.symbols.json');
    if (!fs.existsSync(f)) return null;
    try {
      return JSON.parse(fs.readFileSync(f, 'utf-8'));
    } catch (e) {
      return null;
    }
  }
}

module.exports = new DisplayStore();
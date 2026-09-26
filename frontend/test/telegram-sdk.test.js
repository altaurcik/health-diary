import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('bundled official SDK initializes an Android launch with no network access', () => {
  const raw = 'user=%7B%22id%22%3A123%7D&auth_date=100&hash=synthetic';
  const events = [], storage = new Map();
  const win = {
    location: { hash: '#'+new URLSearchParams({ tgWebAppData: raw, tgWebAppPlatform: 'android', tgWebAppVersion: '8.0' }) },
    TelegramWebviewProxy: { postEvent: (name, data) => events.push([name, data]) },
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    innerHeight: 800, addEventListener() {}, removeEventListener() {},
  };
  win.parent = win;
  const document = { documentElement: { style: { setProperty() {} } }, addEventListener() {}, removeEventListener() {} };
  const sdk = fs.readFileSync(new URL('../public/vendor/telegram-web-app.js', import.meta.url), 'utf8');
  vm.runInNewContext(sdk, { window: win, location: win.location, document, navigator: { userAgent: 'Android' }, TelegramWebviewProxy: win.TelegramWebviewProxy, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout });
  assert.equal(win.Telegram.WebApp.initData, raw);
  assert.equal(win.Telegram.WebApp.platform, 'android');
  win.Telegram.WebApp.ready();
  assert.ok(events.some(([name]) => name === 'web_app_ready'));
});

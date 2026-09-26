import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { telegramLaunch, openBot, BOT_LINK } from '../src/telegram.js';
const raw = 'user=%7B%22id%22%3A123%7D&auth_date=100&hash=synthetic';
const hash = '#'+new URLSearchParams({ tgWebAppData: raw, tgWebAppPlatform: 'android', tgWebAppVersion: '8.0' });
test('SDK is delivered locally and matches the pinned official snapshot', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /src="\/vendor\/telegram-web-app.js\?v=/);
  assert.doesNotMatch(html, /src="https:\/\/telegram.org/);
  const sdk = fs.readFileSync(new URL('../public/vendor/telegram-web-app.js', import.meta.url));
  assert.equal(createHash('sha256').update(sdk).digest('hex'), '3549138a7934039fe7dfd1291a4ee739bd2b705a614308053a8b08a87d85c451');
});
test('signed raw launch data remains available when SDK is absent', () => {
  const result = telegramLaunch({ location: { hash } });
  assert.equal(result.initData, raw); assert.equal(result.sdkAvailable, false); assert.equal(result.hasContext, true);
});
test('bridge without credentials is not misclassified as an ordinary website', () => {
  const result = telegramLaunch({ location: { hash: '' }, TelegramWebviewProxy: {} });
  assert.equal(result.hasContext, true); assert.equal(result.initData, '');
});
test('normal browser and late SDK initialization remain distinct', () => {
  const win = { location: { hash: '' } };
  assert.equal(telegramLaunch(win).hasContext, false);
  win.Telegram = { WebApp: { initData: raw } };
  assert.equal(telegramLaunch(win).initData, raw);
});
test('bot recovery uses native Telegram navigation and closes the failed app', () => {
  const events = [];
  openBot({ location: { hash }, Telegram: { WebApp: { initData: '', openTelegramLink: url => events.push(url), close: () => events.push('close') } } });
  assert.deepEqual(events, [BOT_LINK, 'close']);
});
test('native bridge recovers even when the SDK never loaded', () => {
  const events = [];
  openBot({ location: { hash }, TelegramWebviewProxy: { postEvent: (name, data) => events.push([name, JSON.parse(data)]) } });
  assert.deepEqual(events, [['web_app_open_tg_link', { path_full: '/bpjournalbot?start=app' }], ['web_app_close', {}]]);
});
test('unavailable native navigation has an OS deep-link fallback', () => {
  const win = { location: { hash: '' } }; openBot(win);
  assert.equal(win.location.href, 'tg://resolve?domain=bpjournalbot&start=app');
});
test('fresh launch parameters take precedence over an older SDK session', () => {
  const win = { location: { hash }, Telegram: { WebApp: { initData: 'older-session' } } };
  assert.equal(telegramLaunch(win).initData, raw);
});

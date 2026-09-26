// Launch parameters are untrusted until /api/auth verifies Telegram's signature.
export const BOT_LINK = 'https://t.me/bpjournalbot?start=app';
export function telegramLaunch(win) {
  const tg = win.Telegram?.WebApp || null;
  const hash = new URLSearchParams((win.location?.hash || '').replace(/^#/, ''));
  const raw = hash.get('tgWebAppData') || '';
  const initData = raw || tg?.initData || '';
  const hasContext = Boolean(initData || hash.has('tgWebAppVersion') || hash.has('tgWebAppPlatform') || win.TelegramWebviewProxy);
  return { tg, initData, hasContext, sdkAvailable: Boolean(tg) };
}
export function openBot(win) {
  const launch = telegramLaunch(win);
  if (launch.hasContext && launch.tg?.openTelegramLink) {
    try { launch.tg.openTelegramLink(BOT_LINK); launch.tg.close?.(); return; } catch { /* Try the native bridge below. */ }
  }
  if (win.TelegramWebviewProxy?.postEvent) {
    try {
      win.TelegramWebviewProxy.postEvent('web_app_open_tg_link', JSON.stringify({ path_full: '/bpjournalbot?start=app' }));
      win.TelegramWebviewProxy.postEvent('web_app_close', '{}');
      return;
    } catch { /* Keep a working OS deep link if the bridge is unavailable. */ }
  }
  win.location.href = 'tg://resolve?domain=bpjournalbot&start=app';
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const { AppRoot, Button, Input, List, Section } = require('@telegram-apps/telegram-ui');
const css = readFileSync(require.resolve('@telegram-apps/telegram-ui/dist/styles.css'), 'utf8');
assert.ok(css.length > 0, 'Telegram UI stylesheet is missing or empty');

for (const platform of ['ios', 'base']) {
  for (const appearance of ['light', 'dark']) {
    const html = renderToStaticMarkup(
      React.createElement(AppRoot, { platform, appearance },
        React.createElement(List, null,
          React.createElement(Section, { header: 'Проверка компонентов' },
            React.createElement(Input, { header: 'Значение', defaultValue: '123' }),
            React.createElement(Button, null, 'Сохранить'),
          ),
        ),
      ),
    );
    assert.match(html, /<input\b[^>]*value="123"/);
    assert.match(html, /<button\b/);
    assert.ok(html.includes('Сохранить'));
    assert.ok(html.includes('Проверка компонентов'));
    console.log(`Telegram UI renders: ${platform}, ${appearance}`);
  }
}

console.log('Installation check passed; browser and Telegram integration are not tested here.');

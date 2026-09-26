# Установленные инструменты интерфейса

Проверено: 2026-09-26. Все установки ограничены репозиторием `health-diary`.
Глобальные skills, настройки Codex и зависимости других проектов не менялись.

## Состав

| Инструмент | Путь | Версия / источник |
| --- | --- | --- |
| UI UX Pro Max | `.agents/skills/ui-ux-pro-max/` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), commit `823b0a14d3539b5d78c0efb614426a4fab5983ec` |
| Impeccable | `.agents/skills/impeccable/` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable), commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`; skill 4.4.0, engine 0.1.6 |
| Telegram UI | `frontend/node_modules/@telegram-apps/telegram-ui/` | [TelegramUI](https://github.com/telegram-mini-apps-dev/TelegramUI), npm `@telegram-apps/telegram-ui@2.1.13` |
| React / React DOM | `frontend/node_modules/` | `18.3.1`, совместимые с peerDependencies Telegram UI |

Telegram UI — библиотека приложения, а не skill. Её зависимости зафиксированы
в `frontend/package.json` и `frontend/package-lock.json`. Готовых экранов,
сборщика, сервера разработки, backend и подключения к Telegram пока нет.
`frontend/.npmrc` закрепляет кеш npm в `.cache/npm` проекта для всех
локальных команд, включая `npm run` и `npm ls`.

## Подключение skills

Skills установлены через системный `skill-installer` с явным `--dest`
в `.agents/skills` проекта и фиксированными commit SHA. Для HTTPS загрузки
использован системный набор сертификатов (`SSL_CERT_FILE=/etc/ssl/cert.pem`),
поскольку у локального Python исходная проверка сертификата не прошла.
Проверка TLS не отключалась.

[Codex обнаруживает skills](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)
в `.agents/skills` текущего каталога и его родителей до корня репозитория.
Для автоматического обнаружения рабочей папкой чата должен быть
`/Users/altaur/Documents/VPN/health-diary` или каталог внутри неё.
Из общего чата с рабочей папкой VPN skills можно читать по прямым путям,
приведённым в `AGENTS.md` проекта; вложенный каталог не сканируется автоматически.
Новые skills доступны со следующего хода в соответствующем проекте;
если список не обновился, переоткрыть чат/перезапустить приложение.

Порядок применения: UI UX Pro Max для визуальных правил, Telegram UI
для компонентов, Impeccable для анализа и доработки. Требования владельца
и вертикальный мобильный сценарий имеют приоритет над общими советами.
Перед первым дизайном Impeccable потребует контекст PRODUCT.md; основа для
него уже есть в `docs/PRODUCT_BRIEF.md`, повторно выяснять известные требования
не нужно. Создание PRODUCT.md и выбор дизайна остаются следующим этапом.

## Локальные адаптации upstream

- Сохранены MIT-лицензия UI UX Pro Max и Apache-2.0-лицензия Impeccable
  внутри соответствующих каталогов skills.
- В SKILL.md UI UX Pro Max команды с CLAUDE_PLUGIN_ROOT заменены на
  проектный путь `.agents/skills/ui-ux-pro-max/scripts/search.py` и `python3`.
- В launchers Impeccable (`scripts/impeccable`, `scripts/impeccable.cmd`)
  значение IMPECCABLE_HOME по умолчанию указывает на `.cache/impeccable`
  этого репозитория. Unix-launcher имеет исполняемый бит. Windows-вариант
  адаптирован, но на Windows не проверялся.
- Engine скачан штатным launcher из официального GitHub Release,
  с проверкой SHA-256 по опубликованному sidecar. Кеш `.cache/` исключён
  из Git, как и рабочие файлы `.impeccable/`.
- Автоматические edit hooks не устанавливались; Impeccable доступен как
  skill с явным запуском проверок. Глобальная установка CLI не требуется.

При обновлении skills сверять upstream, сохранять эти адаптации и лицензии.
Не запускать глобальные установщики. В .impeccable/ сейчас всё исключено:
если появятся общие дизайн-артефакты, отдельно определить, что включать в Git.

## Команды и проверки

Из корня `health-diary`:

```sh
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "touch target mobile" --domain ux -n 1
.agents/skills/impeccable/scripts/impeccable engine-probe
.agents/skills/impeccable/scripts/impeccable context
```

Первая команда нашла релевантное правило размеров зон нажатия. Engine
ответил `impeccable-engine 0.1.6`; context правильно определил корень
health-diary и отсутствие ещё не созданных PRODUCT.md/DESIGN.md.
При первом запуске на другой машине launcher может запросить сетевой
доступ для скачивания engine в локальный кеш проекта.

Из `frontend`:

```sh
npm ci --ignore-scripts --no-audit --no-fund --cache ../.cache/npm
npm ls --depth=0
npm run check:ui
```

Установка выполнена на Node 23.6.1 / npm 10.9.2; Python 3.12.6.
`check:ui` проверяет наличие CSS и серверный рендер реальных AppRoot, List,
Section, Input и Button в вариантах ios/base и light/dark. Это проверка
совместимости установленных пакетов, не проверка браузера или Mini App.

# Serenity Pay — Worker оплати (monobank)

Маленький серверний посередник на Cloudflare Workers. Тримає секретний токен
інтернет-еквайрингу monobank і створює рахунки на оплату. Сайт (GitHub Pages)
звертається сюди, а токен ніколи не потрапляє в браузер.

```
Сайт  ──POST /invoice──▶  Worker  ──X-Token──▶  monobank
                             ▲                      │
                             └────── /webhook ◀──────┘  (підтвердження оплати)
```

## Що потрібно спершу

1. **Схвалений інтернет-еквайринг monobank.** Подайте заявку в застосунку monobank
   або на https://web.monobank.ua (потрібен ФОП / юрособа).
2. **Токен** з кабінету мерчанта https://web.monobank.ua — є **тестовий** і **бойовий**.
   Почніть з тестового.
3. Акаунт **Cloudflare** (безкоштовного тарифу достатньо) і встановлений Node.js.

## Розгортання

```bash
cd worker
npm install

# одноразово авторизуйтесь у Cloudflare
npx wrangler login

# додайте токен monobank як СЕКРЕТ (не потрапляє в код/репозиторій)
npx wrangler secret put MONOBANK_TOKEN
# ← вставте тестовий токен monobank

# перший деплой
npx wrangler deploy
```

Після деплою ви отримаєте адресу, напр.:
`https://serenity-pay.ВАШ-САБДОМЕН.workers.dev`

### Завершальні кроки

1. Впишіть цю адресу у два місця:
   - `wrangler.toml` → `SELF_URL` (щоб працював webhook), потім `npx wrangler deploy` ще раз.
   - у корені сайту `js/config.js` → `paymentApi` (щоб кнопки на сайті знали, куди звертатися).
2. Закомітьте зміну `js/config.js` — і оплата запрацює на живому сайті.

## Перевірка

```bash
# має повернути { "service": "serenity-pay", "ok": true }
curl https://serenity-pay.ВАШ-САБДОМЕН.workers.dev/

# створення тестового рахунку
curl -X POST https://serenity-pay.ВАШ-САБДОМЕН.workers.dev/invoice \
  -H "Content-Type: application/json" -d '{"tourId":"cyclades"}'
# → { "invoiceId": "...", "pageUrl": "https://pay.mbnk.biz/..." }
```

З **тестовим** токеном сторінка оплати відкриється в пісочниці monobank — реальні
кошти не списуються. Коли все ок — замініть секрет на бойовий токен
(`npx wrangler secret put MONOBANK_TOKEN` ще раз) і задеплойте.

## Суми передоплати

Задаються в `src/index.js` → об'єкт `TOURS` (у копійках). Сервер — єдине джерело
правди щодо сум, тож підмінити ціну з браузера неможливо.

## Ендпоінти

| Метод | Шлях        | Призначення                                   |
|-------|-------------|-----------------------------------------------|
| POST  | `/invoice`  | Створити рахунок `{ tourId }` → `{ pageUrl }` |
| GET   | `/status`   | Статус `?invoiceId=…`                          |
| POST  | `/webhook`  | Колбек monobank (перевіряє ECDSA-підпис)      |

## Виконання замовлення

Функція `handleWebhook` у `src/index.js` — місце, де при `status === 'success'`
варто підтвердити бронювання: надіслати лист, записати в CRM/таблицю тощо.
Наразі вона лише логує подію. Підпис колбека перевіряється публічним ключем monobank.

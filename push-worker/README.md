# FitSmarter push server

The browser-only FitSmarter on GitHub Pages has no server, and an iPhone shows a notification
from a web app only when a server sends it. This is that server: a Cloudflare Worker on the free
plan that sends

- the end of a rest, when the app is in the background or the phone is locked,
- the workout-day reminder, at your time, on days with a workout planned and none logged yet,
- the test notification from Settings → Reminders.

It has no accounts and stores no training data: one row per browser (its push address and keys)
and the notifications waiting to go out. The page books the reminders for the next 14 days itself,
whenever the plan changes. The Android app does not use it; it schedules its own notifications.

On iPhone, web notifications need iOS 16.4 or later and the app opened from the Home Screen
(Safari → Share → Add to Home Screen), not a Safari tab.

## Set it up once

You need a free Cloudflare account (cloudflare.com, Workers Free plan) and Node.

```bash
cd push-worker
npx wrangler login
```

The VAPID key pair (which server may send to the browsers) lives in `~/.fitsmarter/vapid.json`,
beside the APK keystore. The public half is in `wrangler.toml`; give the Worker the private half
as a secret, then deploy:

```bash
node -e 'process.stdout.write(JSON.stringify(require(require("os").homedir() + "/.fitsmarter/vapid.json").privateJwk))' | npx wrangler secret put VAPID_PRIVATE
npx wrangler deploy
```

`deploy` prints the address, `https://fitsmarter-push.<your-subdomain>.workers.dev`. Tell the web
build about it (a repository variable, read by `.github/workflows/pages.yml`) and rebuild:

```bash
gh variable set PUSH_URL -R Chimuel12/fitsmarter-gym --body https://fitsmarter-push.<your-subdomain>.workers.dev
gh workflow run pages.yml -R Chimuel12/fitsmarter-gym
```

Never change the key pair once people have turned notifications on: every subscription is bound
to the public key, and a new one means everyone turns notifications on again.

## Test

```bash
npm test                       # encryption (RFC 8291 example), VAPID, scheduling, CORS
node test/dev-server.mjs 8787  # the same code in Node, for the app's dev server (VITE_PUSH_URL)
```

The free plan's 100,000 requests a day are far more than this needs: a rest is one request.

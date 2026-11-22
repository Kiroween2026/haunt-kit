# Deploying Haunt Kit

Owner: Yadnesh.

| Part             | Where                                                                 | Staging                                         |
| ---------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| Relay            | Cloudflare Workers + Durable Objects (`packages/relay/wrangler.toml`) | `haunt-kit-relay-staging.<account>.workers.dev` |
| Phone controller | Cloudflare Pages project `haunt-kit-play`                             | `https://staging.haunt-kit-play.pages.dev`      |
| Séance Party     | Pages project `haunt-kit-seance`                                      | `https://staging.haunt-kit-seance.pages.dev`    |
| Steady           | Pages project `haunt-kit-steady`                                      | `https://staging.haunt-kit-steady.pages.dev`    |

`.github/workflows/deploy.yml` deploys all of it on every push to `main`, runs the relay smoke test against the live Worker, and lists the URLs in the run summary. Until the two secrets below exist, it skips with a notice and does not fail.

If Cloudflare says a `pages.dev` name is taken, it adds a suffix. Use the URL printed in the run summary, and change `VITE_CONTROLLER_URL` in `deploy.yml` if the controller's name changed.

## One-time setup (Yadnesh, about 10 minutes)

1. Sign in at https://dash.cloudflare.com (the free plan is enough).
2. **Account ID:** Workers & Pages → Overview. Copy the Account ID from the right-hand side.
3. **API token:** My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers** → Use template. Under Permissions, also add **Account → Cloudflare Pages → Edit**. Account Resources: your account. Create, then copy the token (it is shown once).
4. **GitHub secrets:** https://github.com/Kiroween2026/haunt-kit/settings/secrets/actions → New repository secret:
   - `CLOUDFLARE_API_TOKEN` = the token
   - `CLOUDFLARE_ACCOUNT_ID` = the account ID

   Or from a terminal (the value is read from the prompt, so it doesn't land in shell history):

   ```bash
   gh secret set CLOUDFLARE_API_TOKEN -R Kiroween2026/haunt-kit
   gh secret set CLOUDFLARE_ACCOUNT_ID -R Kiroween2026/haunt-kit
   ```

5. Actions → **Deploy staging** → Run workflow. The summary shows the URLs. Post them in team chat.

Never put the token in a file, a commit, or a chat message.

## Production (deployed Nov 22, redo on Tue Dec 1 after the code freeze)

```bash
pnpm --filter @haunt-kit/relay deploy:production   # needs `wrangler login` once
```

Then deploy the three Pages projects with `--branch main` (production) instead of `--branch staging`, with `VITE_RELAY_URL` set to the production relay.

## Free plan limits (checked Nov 19, 2026)

From https://developers.cloudflare.com/durable-objects/platform/pricing/ (Workers Free plan):

| Limit                   | Free plan                          | Our use                                                                                                                 |
| ----------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Durable Object requests | 100,000 / day                      | Incoming WebSocket messages count 20:1. A phone sends about 10.5 messages/s, so 8 phones for an hour ≈ 15,000 requests. |
| Durable Object duration | 13,000 GB-s / day                  | 128 MB per active room → about 29 room-hours a day.                                                                     |
| Storage                 | SQLite-backed Durable Objects only | `wrangler.toml` uses `new_sqlite_classes`. Room state is a few KB.                                                      |

When a free limit is hit, further requests of that type fail until 00:00 UTC. Normal judging and playtests stay far below these limits. A long overnight soak test could hit the duration limit, so close test rooms when done. The fallback is the Node relay (`packages/relay/src/node`) on Fly.io.

## What can go wrong (found during the first deploy)

| Error                                                             | Cause                                                                                                                  | Fix                                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Cloudflare code 7003, "object identifier is invalid"              | The account ID and the API token were pasted into each other's secret. The ID is 32 characters; the token is about 53. | Set each secret again, one at a time.                                    |
| Cloudflare code 9109, "Cannot use the access token from location" | The token has a **Client IP address filtering** list, so it only works from that address.                              | Edit the token and empty the list. Use **Update**, not **Roll**.         |
| A page URL returns nothing for a minute or two                    | A brand-new `*.pages.dev` address takes a while to appear in DNS.                                                      | Wait. The deploy check retries for 4 minutes.                            |
| The deploy step is green but pages are missing                    | It used to ignore errors.                                                                                              | Fixed: the step stops on the first error and the check curls every page. |

## Production

| Part             | Address                                                  |
| ---------------- | -------------------------------------------------------- |
| Séance Party     | https://haunt-kit-seance.pages.dev                       |
| Steady           | https://haunt-kit-steady.pages.dev                       |
| Phone controller | https://haunt-kit-play.pages.dev                         |
| Relay            | `wss://haunt-kit-relay.yadnesh-deshpande2-1.workers.dev` |

Publish it with Actions → **Deploy production** → Run workflow (from `main`). It runs the tests, deploys the relay, runs the 7-step smoke test on the live relay, deploys the three Pages projects to the production branch, then checks that every page answers. Run it again after the last merge before you submit, so the live sites match the code. Then test it: `LIVE=1 LIVE_PLAY=https://haunt-kit-play.pages.dev/ LIVE_PARTY=https://haunt-kit-seance.pages.dev/ LIVE_STEADY=https://haunt-kit-steady.pages.dev/ pnpm exec playwright test e2e/live.spec.ts`.

The Cloudflare token expires in 30 days. If the deploy fails with an authentication error after that, make a new token and set `CLOUDFLARE_API_TOKEN` again.

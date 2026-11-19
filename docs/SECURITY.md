# Security notes

Owner: Yadnesh. Last review: Nov 19, 2026 (Y8 security pass).

## What is checked, and where

| Risk                          | Protection                                                                                                                                                                     | Code                                   | Test                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | --------------------------------------------------------- |
| Malformed or hostile messages | Every message decoded with zod per channel; decode never throws; unknown fields dropped; unknown types rejected                                                                | `packages/protocol/src/codec.ts`       | `codec.test.ts` (property: any string never throws)       |
| Huge messages                 | 16 KB limit checked before `JSON.parse`; `ws` `maxPayload` 64 KB                                                                                                               | `codec.ts`, `relay/src/node/server.ts` | oversize property                                         |
| Prototype tricks              | Gesture data keys must start with a letter; `__proto__` rejected                                                                                                               | `protocol/src/schemas.ts`              | `gesture data keys` tests                                 |
| Flooding                      | 60 messages/s per connection, token bucket, one warning per second                                                                                                             | `relay/src/core/room.ts`               | rate limit tests                                          |
| Idle connections              | A socket that doesn't join / create / resume in 10 s is closed (4008)                                                                                                          | `room.ts`                              | join timeout tests (core and real WebSocket)              |
| One player posing as another  | Phones can't send a `playerId` on input; the relay stamps the sender's own id                                                                                                  | `room.ts`                              | property "messages never cross players"                   |
| Room guessing                 | 23⁴ ≈ 280,000 codes from `crypto.getRandomValues`, no modulo bias; rooms close 2 min after the host leaves                                                                     | `protocol/src/room-code.ts`            | uniformity test                                           |
| Room takeover                 | `hostToken` (32 random chars) needed to resume, compared in constant time, never logged                                                                                        | `room.ts`, `ids.ts`                    | wrong token test                                          |
| Dev admin API                 | Node relay only; needs `HAUNT_DEV_TOKEN` (≥16 chars, constant-time check); off when `NODE_ENV=production`; off unless listening on loopback; absent from the Cloudflare Worker | `relay/src/node/server.ts`             | admin tests                                               |
| Token leaks                   | Token read from env or git-ignored `.env.local`; not in `mcp.json`; not in errors or logs                                                                                      | `mcp-server/src/admin-client.ts`       | "explains a bad token without revealing any token"        |
| File access from the MCP      | Recording paths must stay inside `recordings/` and end in `.json`                                                                                                              | `mcp-server/src/recordings.ts`         | traversal test                                            |
| Script injection on the phone | Host titles and hints set with `textContent`, never HTML                                                                                                                       | `controller/src/main.ts`               | e2e "Host text is shown as text"                          |
| Microphone privacy            | Audio stays in an `AnalyserNode`; only an RMS number is sent                                                                                                                   | `host-sdk/src/device/browser.ts`       | — (by construction; no audio type exists in the protocol) |
| Deploy secrets                | Only in GitHub Actions secrets; workflow has `contents: read`                                                                                                                  | `.github/workflows/deploy.yml`         | —                                                         |

## Known limits (accepted for a hackathon)

- Anyone with a room code can join while the room has space. That's the product: no accounts.
- No per-IP limit on creating rooms. The Cloudflare free plan's daily limits cap the damage; see `docs/DEPLOY.md`.
- The relay doesn't check `Origin`. Any website could open a room. There's no user data to steal, so this is fine for now.

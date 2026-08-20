# Production E2E Credentials

Use `.env.local` for disposable production E2E credentials:

- `PEBBLEDESK_E2E_EMAIL`
- `PEBBLEDESK_E2E_PASSWORD`
- `PEBBLEDESK_E2E_CENTER_NAME`

Optional role-specific credentials for accepted disposable production members:

- `PEBBLEDESK_E2E_DIRECTOR_EMAIL`
- `PEBBLEDESK_E2E_DIRECTOR_PASSWORD`
- `PEBBLEDESK_E2E_STAFF_EMAIL`
- `PEBBLEDESK_E2E_STAFF_PASSWORD`
- `PEBBLEDESK_E2E_SIGNUP_RATE_LIMIT_TOKEN`

Do not write passwords, session cookies, auth tokens, or raw production secrets into tracked files.
If credentials are missing or no longer work, create a new disposable production E2E account
and update only `.env.local`.

When creating disposable role accounts through production signup, send
`PEBBLEDESK_E2E_SIGNUP_RATE_LIMIT_TOKEN` as the `X-PebbleDesk-E2E-Signup` request header so
configured test-domain accounts use the capped E2E signup bucket.

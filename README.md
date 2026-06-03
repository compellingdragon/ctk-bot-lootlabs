# CompellingCore CTK Bot — LootLabs Postback Version

A full Discord currency/reward bot for CompellingCore using LootLabs instead of Linkvertise.

This version keeps the original features and changes the earning flow so rewards are credited by a LootLabs server-side postback, not by simply visiting a return URL.

## Features

- `/earn` creates a private earning session for the Discord user
- Discord OAuth login verifies the same Discord account
- Server membership check verifies the user joined CompellingCore
- LootLabs API creates a monetized link dynamically
- `puid=session_id` is added to the LootLabs URL
- LootLabs postback credits 100 CTK after valid task completion
- Duplicate postbacks are blocked by `unique_id`
- Sessions expire and can only be completed once
- Earn cooldown prevents farming
- `/balance`
- `/leaderboard`
- `/redeem`
- Admin commands:
  - `/admin-add`
  - `/admin-remove`
  - `/admin-set`
  - `/admin-clear`
  - `/admin-redemptions`
- SQLite database
- Ledger logs for all balance changes

## How the new LootLabs flow works

```txt
1. User runs /earn in Discord.
2. Bot creates a session_id linked to that Discord user.
3. User opens the private website link.
4. Website asks them to login with Discord.
5. Website confirms the logged-in account matches the /earn account.
6. Website checks if the user is in CompellingCore.
7. Website creates a LootLabs content locker link through the LootLabs API.
8. Website appends &puid=session_id to the LootLabs link.
9. User completes the LootLabs task.
10. LootLabs sends a GET request to your postback URL.
11. Your server checks secret, session_id/click_id, unique_id, expiry, and one-time status.
12. Bot adds 100 CTK to the user.
```

## LootLabs docs used

LootLabs says postback is used to make sure users completed tasks. Their postback sends a GET request to your postback URL when a user completes a task. The `puid` value in your LootLabs link is returned as `click_id`, and LootLabs also sends `ip` plus `unique_id`. The `unique_id` is used here to prevent duplicate processing.

## Requirements

- Node.js 18.17+
- Discord bot token
- Discord application client ID and client secret
- A public HTTPS domain for the website
- LootLabs account
- LootLabs API key
- LootLabs postback enabled in your panel/account

## Discord setup

In Discord Developer Portal:

1. Create/open your application.
2. Go to **Bot** and copy the bot token.
3. Enable **Server Members Intent / Guild Members Intent**.
4. Go to **OAuth2** and add this redirect URL:

```txt
https://your-domain.com/auth/callback
```

5. Invite the bot with scopes:

```txt
bot
applications.commands
```

Recommended bot permissions:

```txt
View Channels
Send Messages
Use Slash Commands
Embed Links
```

The CompellingCore server ID is already set as:

```txt
1390687797190594651
```

## LootLabs setup

### 1. Get your API key

In LootLabs, go to your account/profile API key area and generate/copy the API key.

Put it in `.env`:

```env
LOOTLABS_API_KEY=your_lootlabs_api_key
```

### 2. Enable Postback

In the LootLabs panel, enable postback in the advanced/postback area.

Set your postback URL to:

```txt
https://your-domain.com/api/lootlabs/postback?secret=YOUR_SECRET_HERE
```

The secret must match your `.env`:

```env
LOOTLABS_POSTBACK_SECRET=YOUR_SECRET_HERE
```

LootLabs should send parameters like:

```txt
click_id=session_id_from_puid
ip=user_ip
unique_id=unique_completion_id
```

This bot expects at least:

```txt
click_id
unique_id
```

The bot also accepts `puid` as a fallback if LootLabs ever sends that name instead of `click_id`.

## Installation

Unzip the project and run:

```bash
npm install
```

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill it in.

Example `.env`:

```env
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_client_id
CLIENT_SECRET=your_discord_oauth_client_secret
GUILD_ID=1390687797190594651
ADMIN_ROLE_ID=

PUBLIC_BASE_URL=https://your-domain.com
PORT=3000
SESSION_SECRET=make_this_a_long_random_secret

LOOTLABS_API_KEY=your_lootlabs_api_key
LOOTLABS_POSTBACK_SECRET=make_a_random_postback_secret
LOOTLABS_TIER_ID=3
LOOTLABS_NUMBER_OF_TASKS=3
LOOTLABS_THEME=3
LOOTLABS_TITLE=Earn CTK
LOOTLABS_THUMBNAIL=
LOOTLABS_STRICT_IP_CHECK=false

REWARD_AMOUNT=100
EARN_COOLDOWN_HOURS=24
SESSION_EXPIRY_MINUTES=30
DB_PATH=./ctk.sqlite
```

## LootLabs settings explained

### `LOOTLABS_API_KEY`

Your LootLabs API key. Required.

### `LOOTLABS_POSTBACK_SECRET`

A private random secret that you put in both:

```txt
.env
LootLabs postback URL
```

This prevents random people from calling your postback route directly.

### `LOOTLABS_TIER_ID`

LootLabs ad tier.

Common values from their docs:

```txt
1 = Trending & Recommended
2 = Gaming Offers & Recommendations
3 = Profit Maximization
4 = Maximum Profit and Software Products
```

Default:

```env
LOOTLABS_TIER_ID=3
```

### `LOOTLABS_NUMBER_OF_TASKS`

Number of tasks shown on the LootLabs link.

Allowed by LootLabs docs:

```txt
1 to 5
```

Default:

```env
LOOTLABS_NUMBER_OF_TASKS=3
```

### `LOOTLABS_THEME`

LootLabs theme.

Common values from their docs:

```txt
1 = Classic
2 = Sims
3 = Minecraft
4 = GTA
5 = Space
```

Default:

```env
LOOTLABS_THEME=3
```

### `LOOTLABS_STRICT_IP_CHECK`

Default:

```env
LOOTLABS_STRICT_IP_CHECK=false
```

If set to `true`, the bot compares the IP seen during Discord OAuth with the `ip` parameter from LootLabs postback.

This can reduce abuse, but it can also block real users because mobile networks, VPNs, proxies, and hosting providers can change IPs.

Recommended:

```env
LOOTLABS_STRICT_IP_CHECK=false
```

## Deploy slash commands

Run once:

```bash
npm run deploy
```

## Start the bot and website

```bash
npm start
```

The bot and website run in one Node.js process.

## User commands

### `/earn`

Creates a private earning session.

The user receives a link like:

```txt
https://your-domain.com/start/session_id_here
```

They must login with the same Discord account, be in CompellingCore, and complete the LootLabs task.

Reward is only added after LootLabs calls your postback endpoint.

### `/balance`

Shows CTK balance.

### `/leaderboard`

Shows the top CTK balances.

### `/redeem amount item`

Creates a manual redemption request and deducts CTK.

Example:

```txt
/redeem amount:500 item:VIP role for 7 days
```

## Admin commands

Admin commands require either:

- Manage Server permission, or
- the configured `ADMIN_ROLE_ID`

### `/admin-add`

Adds CTK to a user.

### `/admin-remove`

Removes CTK from a user.

### `/admin-set`

Sets a user's CTK balance to an exact amount.

### `/admin-clear`

Sets a user's balance to 0.

### `/admin-redemptions`

Lists pending redemption requests.

## Testing the postback manually

After a user runs `/earn`, completes Discord login, and gets redirected to LootLabs, the session will be in `loot_started` status.

For development only, you can test the postback like this:

```txt
https://your-domain.com/api/lootlabs/postback?secret=YOUR_SECRET_HERE&click_id=SESSION_ID_HERE&ip=127.0.0.1&unique_id=test_unique_123
```

Use a new `unique_id` every time. Duplicate `unique_id` values are blocked.

Do not expose your secret publicly.

## Database

Default database file:

```txt
ctk.sqlite
```

Tables:

```txt
users
earn_sessions
lootlabs_postbacks
ledger
redemptions
```

## Important anti-bypass notes

This version is much better than a simple redirect system because CTK is credited only by the server-side LootLabs postback.

Protection included:

```txt
Discord OAuth same-account check
CompellingCore server membership check
LootLabs puid/click_id session matching
Private postback secret
Unique postback ID duplicate protection
One-time session completion
Session expiry
Earn cooldown
Ledger logging
Optional IP checking
```

For best security:

- Keep `LOOTLABS_POSTBACK_SECRET` private.
- Use HTTPS.
- Do not reward users on `/complete`.
- Reward only inside `/api/lootlabs/postback`.
- Keep cooldown enabled.
- Watch the ledger for suspicious patterns.

## Common issues

### Slash commands do not show

Run:

```bash
npm run deploy
```

Then restart Discord or wait a few minutes.

### Discord login says invalid redirect URI

Your Discord Developer Portal redirect URL must exactly match:

```txt
https://your-domain.com/auth/callback
```

Your `.env` must have:

```env
PUBLIC_BASE_URL=https://your-domain.com
```

No trailing slash.

### Membership check fails

Check:

```txt
Bot is inside CompellingCore
GUILD_ID=1390687797190594651
Guild Members Intent is enabled
Bot was restarted after enabling the intent
```

### LootLabs link creation fails

Check:

```txt
LOOTLABS_API_KEY is correct
Your LootLabs creator details are completed
LOOTLABS_TIER_ID is valid
LOOTLABS_NUMBER_OF_TASKS is 1-5
PUBLIC_BASE_URL is public HTTPS
```

### User completed task but no CTK

Check:

```txt
LootLabs postback is enabled
Postback URL is exactly /api/lootlabs/postback?secret=YOUR_SECRET
LootLabs is sending click_id and unique_id
Session has not expired
The unique_id was not already used
```

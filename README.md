# Telegram Collector for Matrix

**English** · [فارسی](README.fa.md)

Telegram Collector is a self-hosted bridge with an English and Persian web panel. It polls Telegram channels and forwards new text and media to one or more Matrix rooms. You can send one Telegram source to destinations on different Matrix homeservers and apply a different media policy to each room.

The panel opens in English by default. Switch to Persian from the sign-in page, the panel header, or any dialog. Your browser remembers your choice for future visits.

[Docker Hub image](https://hub.docker.com/r/gigplus/telegram_collector) · [Matrix encryption guide (فارسی)](docs/ENCRYPTION_SETUP.md)

## What you can manage in the panel

| Area | Features |
| --- | --- |
| Dashboard | Active Telegram accounts and channels, registered Matrix homeservers, proxy status, recent channel checkpoints, manual refresh, and quick actions |
| Telegram accounts | Multiple accounts, phone and country selection, login codes, optional Telegram cloud passwords, enable, disable and remove |
| Telegram sources | Channel usernames and links, display names, search, editing, pause and resume, custom polling intervals, and one-to-many delivery |
| Matrix homeservers | Password login or an existing access token, connection tests, a default room, and in-place re-login after an expired or revoked token |
| Matrix destinations | Public aliases and room IDs, multiple destinations per source, separate rules for each room, text-only mode, edit, disable and delete |
| Encrypted Matrix rooms | End-to-end encrypted text and media, device verification with emojis or a recovery key, key setup and confirmed encryption identity reset |
| Telegram proxy | SOCKS4, SOCKS5 and MTProto, optional authentication where applicable, status and a real connection test against Telegram |
| Panel security | Admin sign-in, password change, sign-out, and optional TOTP two-factor authentication with QR or a manual setup key |

## Quick start

Install Docker and Docker Compose v2. Open a terminal in the repository root, where [compose.yaml](compose.yaml) is located, and run:

```sh
docker compose up -d --wait
```

Open [localhost:3080](http://localhost:3080). For a server installation, use its address as in `http://SERVER-IP:3080`. Change the host port with the optional `PORT` setting.

The initial username and password on a fresh database are both `admin`. Change the default password from **Security & 2FA**. You can also enable six-digit TOTP codes using an authenticator app. The app creates its session signing key on first start and the supplied Compose deployment runs without a `.env` file.

For a standalone Compose file and image setup, see the [Docker Hub guide](docs/DOCKER_HUB.md).

## Set up your first route

1. **Telegram proxy, if needed.** Save and enable the host, port and supported proxy protocol. Enter SOCKS authentication if your proxy requires it, or the Secret for MTProto. A saved proxy can be used for the first Telegram login before the panel's Test button becomes available. That button is available once an active Telegram account is registered and the proxy is enabled. It checks Telegram reachability and reports connection latency. Matrix uses the app's direct connection.
2. **Telegram account.** Enter the country code, phone number, `API ID` and `API Hash` in the panel. Both API fields are required and must come from the same Telegram application. Enter the login code and, if requested, the account's Telegram cloud password. For a private channel, the Telegram account must already have access. [How to obtain Telegram application credentials](https://core.telegram.org/api/obtaining_api_id)
3. **Matrix homeserver.** Enter the server address and the bot's Matrix user ID, such as `@collector:example.org`. A bare domain defaults to HTTPS and an explicit scheme is preserved. Use the bot's password to obtain a token, or supply a device access token. The bot must be a member of its destination rooms and have permission to send messages.
4. **Destination rooms.** Register each destination by public alias, such as `#news:example.org`, or by room ID, such as `!room123:example.org`. Choose its Matrix homeserver and its upload policy.
5. **Source channel.** Add a Telegram username or link, select its destinations, and set the polling interval. The default interval is 60 seconds and the minimum is 10 seconds. The first poll establishes the starting point for new messages. Adding a channel or changing its configuration uses the existing polling service.

### Media and delivery

Set a download limit for a Telegram source and a separate upload limit for every Matrix destination. Enable or disable photos, video, audio, documents and stickers individually. You can set an overall per-file limit and a per-category limit. A value of 0 leaves the corresponding limit unset. Matrix homeserver upload limits still apply.

For example, send a Telegram source with a 10 MB download cap to one room with a 5 MB upload cap, another with a 10 MB cap, and a third in text-only mode. If all relevant video categories and limits allow it, a 7 MB video goes only to the 10 MB destination. Its text or caption can go to all three.

The collector paginates new messages, groups album media, and only downloads media permitted by the source and at least one destination. Delivery checkpoints are persisted. When a delivery is retried, successful parts are tracked per destination so that the same parts are skipped. Temporary media is removed after processing, with periodic cleanup for stale files.

### Encrypted rooms, device verification and re-login

For E2EE destinations, use a Matrix token associated with a dedicated Collector device. The Collector encrypts outgoing events and attachments for encrypted rooms. If Element reports that the sender's device has not been verified by its owner, use the **Verify device** action next to the homeserver in the panel.

- **Emoji verification** uses a verified Element session signed in to the same bot account. Compare the emojis and confirm on both sides. [Element device verification](https://docs.element.io/latest/element-support/device-verification/how-to-verify-devices/)
- **Recovery key verification** uses the bot account's existing Recovery Key. This works without a second live session. You can prepare and save a new recovery key for a compatible account without recovery storage.
- **Confirmed reset** is available if the key has been lost. Save the replacement key first, enter the Matrix password, and confirm the reset. A reset replaces the account's encryption identity and removes its previous encryption backup. Messages whose keys were only in that backup might become unreadable. [Element recovery and encryption identity](https://docs.element.io/latest/element-support/device-verification/how-to-ensure-you-have-a-recovery-key/)
- **Re-login** updates the saved homeserver's token after a password change or an invalid token. The server record, room mappings and media rules stay in place. If Matrix creates a new device, verify that device for encrypted rooms.

The recovery and re-login forms support HTTPS, localhost, and direct HTTP on a trusted private IPv4 network with an explicit acknowledgement. Private HTTP carries the entered credentials without transport encryption.

## Updates and data persistence

```sh
docker compose pull backend
docker compose up -d --wait
```

Keep these directories next to `compose.yaml` when updating, moving or recreating the containers.

| Directory | Contents |
| --- | --- |
| `mongo-data/` and `mongo-config/` | MongoDB data and configuration files |
| `matrix-crypto/` | Persistent Matrix device keys and crypto state |
| `storage/` | Local storage path |
| `temp/` | Short-lived media used by the forwarder |

The MongoDB service uses five logical databases for authentication, Telegram, Matrix, settings and delivery state. A restored single-database installation is migrated on startup. Keep a backup of MongoDB and the Matrix crypto directory before moving an installation. The public image starts with an empty panel and carries no configured accounts. Compose rotates JSON logs with up to three files of 10 MB each per service.

For service health and collector logs:

```sh
docker compose ps
docker compose logs -f backend
```

## Build from source

Run these commands from the repository root:

```sh
docker compose pull mongodb
docker build -t gigplus/telegram_collector:local .
COLLECTOR_TAG=local docker compose up -d --pull never --wait
```

On PowerShell, set the environment variable on its own line:

```powershell
$env:COLLECTOR_TAG = 'local'
docker compose up -d --pull never --wait
```

## Troubleshooting

| Situation | What to check |
| --- | --- |
| Telegram does not send a login code | Check the phone number, the matching API ID and hash, and the saved Telegram proxy if the server needs one. |
| Test Proxy is disabled | Save and enable the proxy, then connect at least one active Telegram account. |
| A Telegram channel has no deliveries | Check the account, channel access, enabled status, destinations, and polling interval. After the initial poll, use a new message to test the route. |
| Text arrives but media does not | Check text-only mode, allowed categories, source and destination size limits, and the homeserver's upload limit. |
| The Matrix token no longer works | Use **Sign In Again** on the saved server to keep its room mappings and media rules. |
| Element flags an unverified device | Verify the current Collector device using the same bot account, then check a newly delivered event. |

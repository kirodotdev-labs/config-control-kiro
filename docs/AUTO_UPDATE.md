# Automatic updates

Config Control updates itself. A running app checks the public repository's
newest release shortly after it starts and every six hours, downloads the
archive for its system, checks the release's signature, and installs it the
next time nobody has used the app for ten minutes. It restarts on the same
port with the same session, so an open page keeps working. If the new version
doesn't start, the app goes back to the version it had and doesn't install that
one again by itself.

## How an update is trusted

Every release archive has a signature file next to it, `<archive>.sig`. It is an
ed25519 signature over the archive's name, the release version and the
archive's SHA-256. The app installs an update only when that signature matches
the public key built into it (`internal/update/updater.go`, `PublicKey`). A file
signed with another key, for another version or platform, or changed after
signing, is refused, and the app keeps running as it is.

- **Private key**: held only by the publisher's release pipeline. It never
  appears in this repository.
- **Public key**: in the code. It can only check signatures, never make them.

This is separate from the Windows Authenticode signature and the Apple
notarization on the downloads, which stay as they are.

You can check a download yourself with the tool in `tools/updatesign`:
`go run ./tools/updatesign verify <public key> <version> cckiro-windows-amd64.zip`
(the public key is `PublicKey` in `internal/update/updater.go`; the `.sig` file
must sit next to the archive).

## When the app can't update itself

The **Update** button next to the version turns purple and offers the download
for that computer directly. The panel says why:

- automatic updates are switched off (the panel's switch, kept in `~/.kiro/kiroui/update.json`);
- the app can't write to its folder (for example `C:\Program Files` or `/usr/local/bin`);
- on macOS, the app runs straight from Downloads (move it to Applications);
- a version didn't start and the app went back.

For a whole machine, `CCKIRO_UPDATE_URL=off` turns updates off. Development
builds (version `dev`) never update.

package update

import (
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
)

// sigPrefix starts every signature file, so a .sig is recognisable and a
// future format can use another prefix.
const sigPrefix = "cckiro-update-sig/1 "

// Message is what a release signature covers: the asset's name, the release
// version and the archive's SHA-256 (hex). Binding the name and version stops a
// valid signature being replayed for another platform's file or an older release.
func Message(asset, version, sha256hex string) []byte {
	return []byte("cckiro-update/1\n" + asset + "\n" + strings.TrimPrefix(version, "v") + "\n" + strings.ToLower(sha256hex) + "\n")
}

// FormatSig is the text of a .sig file for a signature.
func FormatSig(sig []byte) string { return sigPrefix + base64.StdEncoding.EncodeToString(sig) + "\n" }

// ParseSig reads a .sig file.
func ParseSig(text string) ([]byte, error) {
	t := strings.TrimSpace(text)
	if !strings.HasPrefix(t, sigPrefix) {
		return nil, errors.New("not a cckiro update signature")
	}
	sig, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(t, sigPrefix))
	if err != nil || len(sig) != ed25519.SignatureSize {
		return nil, errors.New("the update signature is malformed")
	}
	return sig, nil
}

// ParsePublicKey reads a base64 ed25519 public key.
func ParsePublicKey(b64 string) (ed25519.PublicKey, error) {
	k, err := base64.StdEncoding.DecodeString(strings.TrimSpace(b64))
	if err != nil || len(k) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("the update public key is malformed")
	}
	return ed25519.PublicKey(k), nil
}

// Verify checks a release signature against the app's public key.
func Verify(pub ed25519.PublicKey, asset, version, sha256hex string, sigText string) error {
	sig, err := ParseSig(sigText)
	if err != nil {
		return err
	}
	if !ed25519.Verify(pub, Message(asset, version, sha256hex), sig) {
		return errors.New("the update signature doesn't match: not signed by the publisher, or the file changed")
	}
	return nil
}

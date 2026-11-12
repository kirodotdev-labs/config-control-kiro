// Command updatesign makes and uses the key that signs Config Control's
// self-updates. It is a release tool: it never ships inside the app.
//
//	updatesign keygen <dir>          writes <dir>/update-signing.key (private, 0600) and
//	                                 <dir>/update-signing.pub; prints only the public key
//	updatesign sign <version> <files...>   signs each archive, writing <file>.sig. The private
//	                                 key is read from $UPDATE_SIGNING_KEY (base64) or the file
//	                                 named by $UPDATE_SIGNING_KEY_FILE; it is never printed.
//	updatesign verify <pubkey-b64> <version> <files...>   checks each <file>.sig
package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"kiromanager/internal/update"
)

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "updatesign:", err)
		os.Exit(1)
	}
}

func run(args []string, out io.Writer) error {
	if len(args) < 1 {
		return errors.New("usage: updatesign keygen <dir> | sign <version> <files...> | verify <pubkey> <version> <files...>")
	}
	switch args[0] {
	case "keygen":
		if len(args) != 2 {
			return errors.New("usage: updatesign keygen <dir>")
		}
		return keygen(args[1], out)
	case "sign":
		if len(args) < 3 {
			return errors.New("usage: updatesign sign <version> <files...>")
		}
		key, err := privateKey()
		if err != nil {
			return err
		}
		for _, f := range args[2:] {
			sum, err := fileSHA256(f)
			if err != nil {
				return err
			}
			sig := ed25519.Sign(key, update.Message(filepath.Base(f), args[1], sum))
			if err := os.WriteFile(f+".sig", []byte(update.FormatSig(sig)), 0o644); err != nil {
				return err
			}
			fmt.Fprintf(out, "signed %s\n", filepath.Base(f))
		}
		return nil
	case "verify":
		if len(args) < 4 {
			return errors.New("usage: updatesign verify <pubkey> <version> <files...>")
		}
		pub, err := update.ParsePublicKey(args[1])
		if err != nil {
			return err
		}
		for _, f := range args[3:] {
			sum, err := fileSHA256(f)
			if err != nil {
				return err
			}
			sig, err := os.ReadFile(f + ".sig")
			if err != nil {
				return err
			}
			if err := update.Verify(pub, filepath.Base(f), args[2], sum, string(sig)); err != nil {
				return fmt.Errorf("%s: %w", filepath.Base(f), err)
			}
			fmt.Fprintf(out, "ok %s\n", filepath.Base(f))
		}
		return nil
	}
	return fmt.Errorf("unknown command %q", args[0])
}

func keygen(dir string, out io.Writer) error {
	keyPath := filepath.Join(dir, "update-signing.key")
	if _, err := os.Stat(keyPath); err == nil {
		return fmt.Errorf("%s already exists; refusing to overwrite a signing key", keyPath)
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return err
	}
	// The private key file holds the 32-byte seed, base64: the same text goes in the GitHub secret.
	if err := os.WriteFile(keyPath, []byte(base64.StdEncoding.EncodeToString(priv.Seed())+"\n"), 0o600); err != nil {
		return err
	}
	pubB64 := base64.StdEncoding.EncodeToString(pub)
	if err := os.WriteFile(filepath.Join(dir, "update-signing.pub"), []byte(pubB64+"\n"), 0o644); err != nil {
		return err
	}
	fmt.Fprintf(out, "public key: %s\nprivate key written to %s (not shown)\n", pubB64, keyPath)
	return nil
}

func privateKey() (ed25519.PrivateKey, error) {
	text := os.Getenv("UPDATE_SIGNING_KEY")
	if text == "" {
		if f := os.Getenv("UPDATE_SIGNING_KEY_FILE"); f != "" {
			b, err := os.ReadFile(f)
			if err != nil {
				return nil, err
			}
			text = string(b)
		}
	}
	seed, err := base64.StdEncoding.DecodeString(strings.TrimSpace(text))
	if err != nil || len(seed) != ed25519.SeedSize {
		return nil, errors.New("no usable signing key: set UPDATE_SIGNING_KEY (base64) or UPDATE_SIGNING_KEY_FILE")
	}
	return ed25519.NewKeyFromSeed(seed), nil
}

func fileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

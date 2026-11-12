package update

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// maxExtracted caps what an archive may unpack to.
const maxExtracted = 300 << 20

// extract unpacks archive into dir: a tar.gz (Linux) or a zip (Windows,
// macOS .app). Only plain files and folders are written, inside dir; links,
// absolute paths and ".." are refused. macOS resource-fork entries are skipped.
func extract(archive, dir string) error {
	if strings.HasSuffix(archive, ".tar.gz") {
		return extractTarGz(archive, dir)
	}
	return extractZip(archive, dir)
}

func safeJoin(dir, name string) (string, error) {
	clean := path.Clean(strings.ReplaceAll(name, "\\", "/"))
	if clean == "." || strings.HasPrefix(clean, "/") || clean == ".." || strings.HasPrefix(clean, "../") || filepath.IsAbs(clean) || strings.Contains(clean, ":") {
		return "", fmt.Errorf("the archive has an unsafe path %q", name)
	}
	return filepath.Join(dir, filepath.FromSlash(clean)), nil
}

func skipEntry(name string) bool {
	n := strings.ReplaceAll(name, "\\", "/")
	return strings.HasPrefix(n, "__MACOSX/") || strings.HasPrefix(path.Base(n), "._")
}

func writeFile(dst string, r io.Reader, mode os.FileMode, budget *int64) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	f, err := os.OpenFile(dst, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode.Perm()|0o600)
	if err != nil {
		return err
	}
	n, err := io.Copy(f, io.LimitReader(r, *budget+1))
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		return err
	}
	if *budget -= n; *budget < 0 {
		return errors.New("the archive unpacks to more than expected")
	}
	return nil
}

func extractTarGz(archive, dir string) error {
	f, err := os.Open(archive)
	if err != nil {
		return err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return fmt.Errorf("the archive isn't a tar.gz: %w", err)
	}
	tr := tar.NewReader(gz)
	budget := int64(maxExtracted)
	for {
		h, err := tr.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("the archive is damaged: %w", err)
		}
		if skipEntry(h.Name) {
			continue
		}
		dst, err := safeJoin(dir, h.Name)
		if err != nil {
			return err
		}
		switch h.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(dst, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := writeFile(dst, tr, os.FileMode(h.Mode), &budget); err != nil {
				return err
			}
		default:
			return fmt.Errorf("the archive has a link or special file %q", h.Name)
		}
	}
}

func extractZip(archive, dir string) error {
	zr, err := zip.OpenReader(archive)
	if err != nil {
		return fmt.Errorf("the archive isn't a zip: %w", err)
	}
	defer zr.Close()
	budget := int64(maxExtracted)
	for _, zf := range zr.File {
		if skipEntry(zf.Name) {
			continue
		}
		dst, err := safeJoin(dir, zf.Name)
		if err != nil {
			return err
		}
		mode := zf.Mode()
		switch {
		case mode.IsDir():
			if err := os.MkdirAll(dst, 0o755); err != nil {
				return err
			}
		case mode.IsRegular():
			rc, err := zf.Open()
			if err != nil {
				return err
			}
			perm := mode.Perm()
			if perm == 0 {
				perm = 0o644
			}
			err = writeFile(dst, rc, perm, &budget)
			rc.Close()
			if err != nil {
				return err
			}
		default:
			return fmt.Errorf("the archive has a link or special file %q", zf.Name)
		}
	}
	return nil
}

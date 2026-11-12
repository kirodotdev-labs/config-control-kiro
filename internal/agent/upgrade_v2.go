package agent

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"kiromanager/internal/shared/utils"
)

const upgradeTimeout = 90 * time.Second

// UpgradePreview is what Kiro's own upgrade would do to one agent file.
type UpgradePreview struct {
	Before  string `json:"before"`
	After   string `json:"after"`
	Changed bool   `json:"changed"`
	Output  string `json:"output"` // Kiro's report, including conversion warnings
	Hash    string `json:"hash"`   // of Before; Apply refuses if the file changed since
}

// PreviewUpgrade runs `kiro-cli agent upgrade` on a private copy of the agent,
// so the user sees Kiro's exact result before anything on disk changes.
func (s *AgentService) PreviewUpgrade(id string) (*UpgradePreview, error) {
	path, err := s.existingPath(id)
	if err != nil {
		return nil, err
	}
	if formatOf(path) != formatJSON {
		return nil, utils.BadRequest("Kiro's upgrade converts JSON agents only. Edit this Markdown agent's frontmatter directly.", "UPGRADE_JSON_ONLY")
	}
	before, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	tmp, err := os.MkdirTemp("", "cckiro-upgrade-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmp)
	copyPath := filepath.Join(tmp, filepath.Base(path))
	if err := os.WriteFile(copyPath, before, 0o600); err != nil {
		return nil, err
	}
	res, p := s.cli.Run(context.Background(), upgradeTimeout, "agent", "upgrade", tmp, "--no-backup")
	if p != nil {
		return nil, p.AppError()
	}
	after, err := os.ReadFile(copyPath)
	if err != nil {
		return nil, err
	}
	output := strings.TrimSpace(string(res.Stdout) + "\n" + string(res.Stderr))
	return &UpgradePreview{
		Before: string(before), After: string(after), Changed: string(before) != string(after),
		// Kiro reports paths in the private copy; show the real folder instead.
		Output: strings.ReplaceAll(output, tmp, filepath.Dir(path)), Hash: hashOf(before),
	}, nil
}

// ApplyUpgrade writes Kiro's conversion of the agent, after saving the
// original as a backup with Kiro's naming (`.bak`, `.bak.1`, …). hash must be
// from the preview the user saw.
func (s *AgentService) ApplyUpgrade(id, hash string) (string, error) {
	prev, err := s.PreviewUpgrade(id)
	if err != nil {
		return "", err
	}
	if prev.Hash != hash {
		return "", utils.NewAppError("The agent changed since the preview. Preview the upgrade again.", http.StatusConflict, "CHANGED_SINCE_PREVIEW")
	}
	if !prev.Changed {
		return "", nil
	}
	path, _ := s.existingPath(id)
	backup := nextBackup(path)
	if err := utils.WriteFileAtomic(backup, []byte(prev.Before)); err != nil {
		return "", err
	}
	if err := utils.WriteFileAtomic(path, []byte(prev.After)); err != nil {
		return "", err
	}
	s.logger.Info("Upgraded agent %s (backup %s)", id, filepath.Base(backup))
	return backup, nil
}

// RestoreBackup puts the newest backup back in place of the agent and removes
// it, which is Kiro's documented way to undo an upgrade.
func (s *AgentService) RestoreBackup(id string) error {
	path, err := s.existingPath(id)
	if err != nil {
		return err
	}
	backup := latestBackup(path)
	if backup == "" {
		return utils.NewAppError("There is no backup of this agent to restore.", http.StatusNotFound, "NO_BACKUP")
	}
	data, err := os.ReadFile(backup)
	if err != nil {
		return err
	}
	if err := utils.WriteFileAtomic(path, data); err != nil {
		return err
	}
	return os.Remove(backup)
}

// UpgradeScope runs Kiro's upgrade on every JSON agent of the active scope.
// With dryRun, nothing is written and Kiro reports what it would change.
func (s *AgentService) UpgradeScope(dryRun bool) (string, error) {
	args := []string{"agent", "upgrade", s.kiro.AgentsDir()}
	if dryRun {
		args = append(args, "--dry-run")
	}
	res, p := s.cli.Run(context.Background(), upgradeTimeout, args...)
	if p != nil {
		return "", p.AppError()
	}
	return strings.TrimSpace(string(res.Stdout) + "\n" + string(res.Stderr)), nil
}

func hashOf(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

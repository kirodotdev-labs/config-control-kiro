package system

import (
	"encoding/json"
	"kiromanager/internal/shared/utils"
	"os"
)

// ReadJSONFile reads path and unmarshals its JSON into v.
func (s *KiroService) ReadJSONFile(path string, v any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, v)
}

// WriteJSONFile writes v as indented JSON to path, creating parent dirs.
func (s *KiroService) WriteJSONFile(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return utils.WriteFileAtomic(path, data)
}

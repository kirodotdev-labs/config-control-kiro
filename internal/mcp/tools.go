package mcp

import (
	"fmt"
	"os"
	"sync"
	"time"

	"kiromanager/internal/system"
)

// serverTimeout bounds how long one server may take to list its tools, so a
// slow or broken server never blocks the others.
const serverTimeout = 15 * time.Second

// ServerTools is the tool listing for one server. Error is set (and Tools is
// empty) when the server could not be started or reached, so the UI can tell
// "no tools" apart from "failed to connect".
type ServerTools struct {
	Tools []MCPTool `json:"tools"`
	Error string    `json:"error,omitempty"`
}

// GetToolsFromConfig lists tools for every enabled server concurrently; one
// slow or broken server never blocks the others. Each result is remembered
// as the server's size, or its failure.
func (s *MCPService) GetToolsFromConfig(servers map[string]*MCPServerConfig) (map[string]ServerTools, error) {
	tools := make(map[string]ServerTools, len(servers))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for name, cfg := range servers {
		if cfg == nil || cfg.Disabled {
			continue
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			list, err := s.measure(name, cfg.launch())
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				tools[name] = ServerTools{Tools: []MCPTool{}, Error: err.Error()}
				return
			}
			tools[name] = ServerTools{Tools: list}
		}()
	}
	wg.Wait()
	return tools, nil
}

// MeasureTools lists the tools of each server so its size is known, and
// returns why each failed one couldn't be measured. Servers being measured
// already, for another request, are waited for rather than started twice.
func (s *MCPService) MeasureTools(servers map[string]system.MCPLaunch) map[string]string {
	failed := map[string]string{}
	var mu sync.Mutex
	var wg sync.WaitGroup
	for name, launch := range servers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.measure(name, launch); err != nil {
				mu.Lock()
				failed[name] = err.Error()
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	return failed
}

// measure lists one server's tools and remembers the result. A second call
// for the same server while one runs waits for it and shares its result.
func (s *MCPService) measure(name string, launch system.MCPLaunch) ([]MCPTool, error) {
	key := name + "\x00" + launch.Key()
	s.mu.Lock()
	if run, ok := s.running[key]; ok {
		s.mu.Unlock()
		<-run.done
		return run.tools, run.err
	}
	run := &measurement{done: make(chan struct{})}
	s.running[key] = run
	s.mu.Unlock()

	run.tools, run.err = listWithTimeout(name, launch, s.workDir())
	sizes := s.kiroService.MCPSizes()
	if run.err != nil {
		s.logger.Warn("Failed to get tools for %s: %v", name, run.err)
		sizes.RecordFailure(name, launch, run.err.Error())
	} else {
		if run.tools == nil {
			run.tools = []MCPTool{}
		}
		if err := sizes.Record(name, launch, toolsSize(name, run.tools)); err != nil {
			s.logger.Warn("Could not remember the size of %s: %v", name, err)
		}
	}
	s.mu.Lock()
	delete(s.running, key)
	s.mu.Unlock()
	close(run.done)
	return run.tools, run.err
}

// measurement is one tools listing in progress.
type measurement struct {
	done  chan struct{}
	tools []MCPTool
	err   error
}

// workDir is the folder servers start in, as Kiro starts them: the active
// Workspace, or the home folder in Global.
func (s *MCPService) workDir() string {
	if s.kiroService.GetMode() == system.ModeWorkspace {
		return s.kiroService.GetActiveWorkspace()
	}
	home, _ := os.UserHomeDir()
	return home
}

// listWithTimeout runs listServerTools with serverTimeout.
func listWithTimeout(name string, launch system.MCPLaunch, dir string) ([]MCPTool, error) {
	type result struct {
		tools []MCPTool
		err   error
	}
	done := make(chan result, 1)
	go func() {
		t, err := listServerTools(launch, dir)
		done <- result{t, err}
	}()
	select {
	case r := <-done:
		return r.tools, r.err
	case <-time.After(serverTimeout):
		return nil, fmt.Errorf("timeout connecting to %s", name)
	}
}

// listServerTools connects with the HTTP or stdio transport and lists tools.
func listServerTools(cfg system.MCPLaunch, dir string) ([]MCPTool, error) {
	switch {
	case cfg.URL != "":
		return NewMCPHttpClient(cfg.URL, cfg.Headers).ListTools()
	case cfg.Command != "":
		client := NewMCPStdioClient(cfg.Command, cfg.Args, cfg.Env, dir)
		defer client.Close()
		if err := client.Connect(); err != nil {
			return nil, err
		}
		return client.ListTools()
	default:
		return []MCPTool{}, nil
	}
}

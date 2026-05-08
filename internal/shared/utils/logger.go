package utils

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// LogLevel represents the severity of a log message.
type LogLevel int

const (
	DEBUG LogLevel = iota
	INFO
	WARN
	ERROR
)

// Logger writes leveled log messages to stdout and a rotating log file.
type Logger struct {
	level    LogLevel
	file     *os.File
	logger   *log.Logger
	maxSize  int64
	logDir   string
	filename string
	mu       sync.Mutex
}

// NewLogger creates a Logger that writes to a file in the system temp directory.
func NewLogger() *Logger {
	logDir := filepath.Join(os.TempDir(), "kiromanager")
	filename := "kiromanager.log"
	level := INFO
	maxSize := int64(10 * 1024 * 1024) // 10MB

	os.MkdirAll(logDir, 0755)

	l := &Logger{
		level:    level,
		maxSize:  maxSize,
		logDir:   logDir,
		filename: filename,
	}

	l.openLogFile()

	return l
}

// openLogFile opens or creates the log file for appending.
func (l *Logger) openLogFile() error {
	logPath := filepath.Join(l.logDir, l.filename)
	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return err
	}

	l.file = file
	l.logger = log.New(io.MultiWriter(os.Stdout, file), "", log.LstdFlags)
	return nil
}

// rotate renames the current log file and opens a new one if the size limit is exceeded.
func (l *Logger) rotate() error {
	if l.file == nil {
		return nil
	}

	stat, err := l.file.Stat()
	if err != nil {
		return err
	}

	if stat.Size() < l.maxSize {
		return nil
	}

	l.file.Close()

	oldPath := filepath.Join(l.logDir, l.filename)
	newPath := filepath.Join(l.logDir, fmt.Sprintf("%s.%d", l.filename, time.Now().Unix()))

	if err := os.Rename(oldPath, newPath); err != nil {
		return err
	}

	return l.openLogFile()
}

// log writes a message at the given level if it meets the minimum threshold.
func (l *Logger) log(level LogLevel, msg string) {
	if level < l.level {
		return
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	l.rotate()

	prefix := map[LogLevel]string{
		DEBUG: "[DEBUG]",
		INFO:  "[INFO] ",
		WARN:  "[WARN] ",
		ERROR: "[ERROR]",
	}

	l.logger.Printf("%s %s", prefix[level], msg)
}

// Debug logs a message at DEBUG level.
func (l *Logger) Debug(format string, args ...interface{}) {
	l.log(DEBUG, fmt.Sprintf(format, args...))
}

// Info logs a message at INFO level.
func (l *Logger) Info(format string, args ...interface{}) { l.log(INFO, fmt.Sprintf(format, args...)) }

// Warn logs a message at WARN level.
func (l *Logger) Warn(format string, args ...interface{}) { l.log(WARN, fmt.Sprintf(format, args...)) }

// Error logs a message at ERROR level.
func (l *Logger) Error(format string, args ...interface{}) {
	l.log(ERROR, fmt.Sprintf(format, args...))
}

// Close closes the underlying log file.
func (l *Logger) Close() error {
	if l.file != nil {
		return l.file.Close()
	}
	return nil
}

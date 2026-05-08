/**
 * @fileoverview Unified JSON Editor - Single editor for all JSON editing needs
 * @llm-purpose Handles both Agent field highlighting and MCP server highlighting
 * @dependencies CodeMirror 6, Material-UI theming
 * @patterns Mode-based: editable/readonly, highlightFields for agents, highlightServer for MCP
 * @usage <JSONEditor mode="editable" value={json} onChange={fn} highlightFields={['name']} />
 */

import React, { useRef, useEffect, useImperativeHandle } from 'react';
import { Box, useTheme } from '@mui/material';
import { EditorView, keymap, highlightSpecialChars, drawSelection, Decoration, lineNumbers } from '@codemirror/view';
import { EditorState, StateField, StateEffect } from '@codemirror/state';
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands';
import { foldGutter, indentOnInput, bracketMatching, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { linter } from '@codemirror/lint';

// Create highlight effect and field
const highlightEffect = StateEffect.define();
const highlightField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(highlights, tr) {
    highlights = highlights.map(tr.changes);
    for (let e of tr.effects) {
      if (e.is(highlightEffect)) {
        highlights = Decoration.set(e.value);
      }
    }
    return highlights;
  },
  provide: f => EditorView.decorations.from(f)
});

const highlightMark = Decoration.mark({
  class: "cm-highlight-unified",
  attributes: { style: "background-color: rgba(33, 150, 243, 0.3); border-radius: 2px;" }
});

const JSONEditor = React.forwardRef(({ 
  mode = 'editable', // 'editable', 'readonly'
  value = '', 
  onChange,
  onValidationChange,
  
  // Highlighting features
  highlightFields = [], // Agent mode: ['name', 'tools']
  highlightServer = null, // MCP mode: 'serverName'
  
  // Event handlers
  onFocusChange,
  onCursorChange,
  
  // Display options
  placeholder = '',
  height = '400px',
  sx = {}
}, ref) => {
  const theme = useTheme();
  const editorRef = useRef();
  const viewRef = useRef();
  const isDark = theme.palette.mode === 'dark';
  const isReadOnly = mode === 'readonly';

  // Format JSON function
  const formatJSON = () => {
    if (!viewRef.current) return;
    try {
      const currentValue = viewRef.current.state.doc.toString();
      const parsed = JSON.parse(currentValue);
      const formatted = JSON.stringify(parsed, null, 2);
      
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: formatted
        }
      });
    } catch (error) {
      console.warn('JSON formatting failed:', error);
    }
  };

  // Clear highlights
  const clearHighlights = () => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: highlightEffect.of([])
    });
  };

  // Highlight fields (Agent mode)
  const highlightJSONFields = (fields) => {
    if (!viewRef.current || !fields || fields.length === 0) {
      clearHighlights();
      return;
    }

    try {
      const doc = viewRef.current.state.doc.toString();
      const fieldPath = fields[0]; // e.g., "mcpServers" or "mcpServers.serverName"
      const parts = fieldPath.split('.');
      
      let searchPattern;
      if (parts.length === 1) {
        // Top-level field: "fieldName":
        searchPattern = new RegExp(`"${parts[0]}"\\s*:`, 'g');
      } else {
        // Nested field: find parent first, then child
        // For "mcpServers.serverName", find "serverName": within mcpServers object
        searchPattern = new RegExp(`"${parts[parts.length - 1]}"\\s*:`, 'g');
      }
      
      const match = searchPattern.exec(doc);
      
      if (match) {
        const from = match.index;
        
        // Find the end of the value (could be string, number, object, array, boolean, null)
        let to = from + match[0].length;
        let depth = 0;
        let inString = false;
        let escaped = false;
        
        // Skip whitespace after colon
        while (to < doc.length && /\s/.test(doc[to])) {
          to++;
        }
        
        const startChar = doc[to];
        
        // Handle different value types
        if (startChar === '{' || startChar === '[') {
          // Object or array - find matching closing bracket
          const openChar = startChar;
          const closeChar = startChar === '{' ? '}' : ']';
          depth = 1;
          to++;
          
          while (to < doc.length && depth > 0) {
            const char = doc[to];
            
            if (escaped) {
              escaped = false;
            } else if (char === '\\') {
              escaped = true;
            } else if (char === '"') {
              inString = !inString;
            } else if (!inString) {
              if (char === openChar) {
                depth++;
              } else if (char === closeChar) {
                depth--;
              }
            }
            to++;
          }
        } else if (startChar === '"') {
          // String value
          to++;
          while (to < doc.length) {
            const char = doc[to];
            if (escaped) {
              escaped = false;
            } else if (char === '\\') {
              escaped = true;
            } else if (char === '"') {
              to++;
              break;
            }
            to++;
          }
        } else {
          // Number, boolean, or null - read until comma, newline, or closing bracket
          while (to < doc.length && !/[,\n\r}\]]/.test(doc[to])) {
            to++;
          }
        }
        
        // Highlight the entire field and value
        viewRef.current.dispatch({
          effects: highlightEffect.of([highlightMark.range(from, to)])
        });
        
        // Scroll to the highlighted field
        requestAnimationFrame(() => {
          if (viewRef.current) {
            try {
              viewRef.current.dispatch({
                effects: EditorView.scrollIntoView(from, { y: "center" })
              });
              // Don't focus - let user continue typing in the field
            } catch (error) {
              console.warn('Scroll failed:', error);
            }
          }
        });
      }
    } catch (error) {
      console.warn('Field highlighting failed:', error);
    }
  };

  // Highlight server (MCP mode)
  const highlightJSONServer = (serverName) => {
    if (!viewRef.current || !serverName) {
      clearHighlights();
      return;
    }

    try {
      const doc = viewRef.current.state.doc.toString();
      const serverPattern = new RegExp(`"${serverName}"\\s*:\\s*\\{`);
      const match = serverPattern.exec(doc);
      
      if (match) {
        const startPos = match.index;
        const openBracePos = match.index + match[0].length - 1; // Position of the opening brace
        let braceCount = 1;
        let pos = openBracePos + 1;
        
        // Find the matching closing brace
        while (pos < doc.length && braceCount > 0) {
          if (doc[pos] === '{') braceCount++;
          else if (doc[pos] === '}') braceCount--;
          pos++;
        }
        
        viewRef.current.dispatch({
          effects: highlightEffect.of([highlightMark.range(startPos, pos)])
        });
      }
    } catch (error) {
      console.warn('Server highlighting failed:', error);
    }
  };

  // Initialize editor
  useEffect(() => {
    if (!editorRef.current) return;

    const extensions = [
      highlightField,
      lineNumbers(),
      foldGutter(),
      drawSelection(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      highlightSpecialChars(),
      history(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        indentWithTab
      ]),
      json(),
      linter(jsonParseLinter()),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      isDark ? oneDark : [],
      EditorView.theme({
        '&': {
          height: '100%',
        },
        '.cm-editor': {
          height: '100%',
        },
        '.cm-scroller': {
          fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
          fontSize: '13px',
          lineHeight: '1.4',
        },
        '.cm-content': {
          padding: '12px',
          minHeight: '100%',
        },
        '.cm-focused': {
          outline: 'none',
        },
        '.cm-editor.cm-focused': {
          outline: 'none',
        },
        '.cm-highlight-unified': {
          backgroundColor: 'rgba(33, 150, 243, 0.3)',
          borderRadius: '2px',
        }
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onChange && !isReadOnly) {
          const newValue = update.state.doc.toString();
          onChange(newValue);
          
          // Validation callback
          if (onValidationChange) {
            try {
              JSON.parse(newValue);
              onValidationChange(true, null);
            } catch (error) {
              onValidationChange(false, error.message);
            }
          }
        }
        
        // Cursor change callback
        if (update.selectionSet && onCursorChange) {
          const selection = update.state.selection.main;
          onCursorChange(selection.from, selection.to);
        }
      }),
      EditorView.domEventHandlers({
        focus: () => onFocusChange?.(true),
        blur: () => {
          onFocusChange?.(false);
          // Auto-format on blur if valid JSON
          if (!isReadOnly) {
            formatJSON();
          }
        }
      }),
      ...(isReadOnly ? [EditorState.readOnly.of(true)] : [])
    ];

    const state = EditorState.create({
      doc: value || '',
      extensions
    });

    const view = new EditorView({
      state,
      parent: editorRef.current
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [isDark, isReadOnly]);

  // Handle highlighting (both Agent and MCP modes)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (highlightServer) {
        highlightJSONServer(highlightServer);
      } else if (highlightFields && highlightFields.length > 0) {
        highlightJSONFields(highlightFields);
      } else {
        clearHighlights();
      }
    }, 50);
    
    return () => clearTimeout(timer);
  }, [highlightFields, highlightServer, value]);

  // Update content when value changes externally
  useEffect(() => {
    if (viewRef.current && viewRef.current.state.doc.toString() !== value) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: value || ''
        }
      });
    }
  }, [value]);

  // Expose functions
  useImperativeHandle(ref, () => ({
    format: formatJSON,
    focus: () => viewRef.current?.focus(),
    clearHighlights,
    getValue: () => viewRef.current?.state.doc.toString() || ''
  }));

  const shouldHighlight = highlightFields?.length > 0 || highlightServer;

  return (
    <Box
      ref={editorRef}
      sx={{
        height,
        width: '100%',
        border: 1,
        borderColor: shouldHighlight ? 'primary.main' : 'divider',
        borderRadius: 1,
        overflow: 'auto',
        backgroundColor: isDark ? '#1e1e1e' : '#ffffff',
        '& .cm-editor': {
          height: '100%',
        },
        '& .cm-scroller': {
          height: '100%',
        },
        ...sx
      }}
    />
  );
});

JSONEditor.displayName = 'JSONEditor';

export default JSONEditor;

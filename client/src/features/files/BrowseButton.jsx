/**
 * @fileoverview A "Browse…" button that opens the path picker.
 */
import { useState } from 'react';
import { Button } from '@mui/material';
import { FolderOpen } from '@mui/icons-material';
import { PathPickerDialog } from './PathPickerDialog';

/**
 * @param {Object} props
 * @param {(path: string) => void} props.onPick
 * @param {'file'|'directory'} [props.mode]
 * @param {string[]} [props.extensions]
 * @param {string} [props.initialPath]
 * @param {string} [props.label]
 * @param {string} [props.title]
 */
export function BrowseButton({ onPick, mode = 'file', extensions, initialPath, label = 'Browse…', title }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="small" variant="outlined" startIcon={<FolderOpen />} onClick={() => setOpen(true)} sx={{ flexShrink: 0 }}>
        {label}
      </Button>
      <PathPickerDialog
        open={open} onClose={() => setOpen(false)} onPick={onPick}
        mode={mode} extensions={extensions} initialPath={initialPath} title={title}
      />
    </>
  );
}

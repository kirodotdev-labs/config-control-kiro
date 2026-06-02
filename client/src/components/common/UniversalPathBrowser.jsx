import React, { useState } from 'react';
import { Button } from '@mui/material';
import { FolderOpen } from '@mui/icons-material';
import FileBrowserDialog from './FileBrowserDialog';

/**
 * Universal Path Browser — opens FileBrowserDialog and forwards the
 * selected file:// URI back via onSelect.
 *
 * @param {string} [label="Browse"] - Button label
 * @param {function} onSelect - Callback when a path is selected (file:// URI)
 * @param {string} [title="Select File or Directory"]
 * @param {object} [buttonProps] - Additional MUI Button props
 * @param {string} [initialPath] - When provided, the dialog opens
 *   pre-navigated to this path (or its parent if it is a file). Accepts
 *   any common OS format and is resolved via the backend before opening.
 */
const UniversalPathBrowser = ({
  label = "Browse",
  onSelect,
  title = "Select File or Directory",
  buttonProps = {},
  initialPath = '',
}) => {
  const [open, setOpen] = useState(false);

  const handleSelect = (fileUri) => {
    onSelect(fileUri);
    setOpen(false);
  };

  return (
    <>
      <Button
        size="small"
        startIcon={<FolderOpen />}
        onClick={() => setOpen(true)}
        {...buttonProps}
      >
        {label}
      </Button>

      <FileBrowserDialog
        open={open}
        onClose={() => setOpen(false)}
        onFileSelect={handleSelect}
        title={title}
        initialPath={initialPath}
      />
    </>
  );
};

export default UniversalPathBrowser;

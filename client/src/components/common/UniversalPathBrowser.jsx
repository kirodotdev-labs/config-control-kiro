import React, { useState } from 'react';
import { Button } from '@mui/material';
import { FolderOpen } from '@mui/icons-material';
import FileBrowserDialog from './FileBrowserDialog';

/**
 * Universal Path Browser - Simplified wrapper for FileBrowserDialog
 * Allows selecting both files and directories without managing dialog state
 * 
 * @param {string} label - Button label (default: "Browse")
 * @param {function} onSelect - Callback when path is selected (receives file:// URI)
 * @param {string} title - Dialog title (default: "Select File or Directory")
 * @param {object} buttonProps - Additional MUI Button props
 */
const UniversalPathBrowser = ({ 
  label = "Browse", 
  onSelect, 
  title = "Select File or Directory",
  buttonProps = {}
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
      />
    </>
  );
};

export default UniversalPathBrowser;

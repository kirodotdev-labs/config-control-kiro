/**
 * @fileoverview Custom hook encapsulating file explorer state and CRUD operations.
 */
import { useState, useCallback, useRef } from 'react';
import { useClipboard } from '../../contexts/ClipboardContext';
import { fetchWithAuth } from '../../services/api';

const FILE_TEMPLATE = (filename) => `# ${filename}

## Usage Prompts

[Describe usage here]

## Configuration
\`\`\`json
{
  "name": "${filename}"
}
\`\`\`
`;

export const useFileExplorer = ({ enabled, basePath, fileFilter = ['.md'], onRefresh }) => {
  const [selectedItems, setSelectedItems] = useState([]);
  const { clipboard, setClipboard } = useClipboard();
  const lastSelectedIndex = useRef(null);

  // Selection handlers
  const handleSelect = useCallback((item, event) => {
    if (!enabled) return;

    if (event.ctrlKey || event.metaKey) {
      setSelectedItems(prev => 
        prev.find(i => i.path === item.path)
          ? prev.filter(i => i.path !== item.path)
          : [...prev, item]
      );
    } else if (event.shiftKey && lastSelectedIndex.current !== null) {
      setSelectedItems([item]);
    } else {
      const isAlreadySelected = selectedItems.find(i => i.path === item.path);
      if (!isAlreadySelected || event.type !== 'contextmenu') {
        setSelectedItems([item]);
      }
    }
  }, [enabled, selectedItems]);

  const clearSelection = useCallback(() => {
    setSelectedItems([]);
  }, []);

  // Clipboard operations
  const handleCopy = useCallback(() => {
    if (!enabled || selectedItems.length === 0) return;
    setClipboard({ action: 'copy', items: selectedItems });
  }, [enabled, selectedItems]);

  const handleCut = useCallback(() => {
    if (!enabled || selectedItems.length === 0) return;
    setClipboard({ action: 'cut', items: selectedItems });
  }, [enabled, selectedItems]);

  const handlePaste = useCallback(async (targetFolder, onConflict) => {
    if (!enabled || !clipboard) return;
    
    try {
      const sources = clipboard.items.map(item => item.fsPath || item.path);
      const dest = targetFolder.path;

      // Check for conflicts
      const conflictRes = await fetchWithAuth('/api/fileexplorer/check-conflicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources, dest })
      });
      const conflictData = await conflictRes.json();

      let resolution = 'overwrite';
      if (conflictData.conflicts && conflictData.conflicts.length > 0) {
        // Ask user how to handle conflicts
        resolution = await onConflict(conflictData.conflicts);
        if (resolution === 'cancel') return;
      }

      // Perform bulk operation
      const endpoint = clipboard.action === 'copy' ? '/api/fileexplorer/bulk-copy' : '/api/fileexplorer/bulk-cut';
      
      const response = await fetchWithAuth(`${endpoint}?resolution=${resolution}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources, dest })
      });

      const result = await response.json();
      
      if (result.failed && result.failed.length > 0) {
        throw new Error(`Failed to paste ${result.failed.length} items`);
      }

      if (clipboard.action === 'cut') {
        setClipboard(null);
      }
      
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Paste failed:', error);
      throw error;
    }
  }, [enabled, clipboard, onRefresh]);

  const handleDelete = useCallback(async () => {
    if (!enabled || selectedItems.length === 0) return;
    
    const paths = selectedItems.map(item => item.fsPath || item.path);
    
    try {
      const response = await fetchWithAuth('/api/fileexplorer/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths })
      });

      const result = await response.json();
      
      if (result.failed && result.failed.length > 0) {
        throw new Error(`Failed to delete ${result.failed.length} items`);
      }
      
      setSelectedItems([]);
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Delete failed:', error);
      throw error;
    }
  }, [enabled, selectedItems, onRefresh]);

  const handleRename = useCallback(async (item, newName) => {
    if (!enabled) return;
    
    try {
      const fullPath = item.fsPath || item.path;
      const response = await fetchWithAuth('/api/fileexplorer/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath, newName })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Rename failed');
      }
      
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Rename failed:', error);
      throw error;
    }
  }, [enabled, onRefresh]);

  const handleNewFile = useCallback(async (targetFolder, fileName, onConflict) => {
    if (!enabled) return;

    try {
      const basePath = targetFolder.path;
      const nameWithoutExt = fileName.replace(/\.md$/, '');
      const content = FILE_TEMPLATE(nameWithoutExt);
      const path = `${basePath}/${fileName}`;

      const response = await fetchWithAuth('/api/fileexplorer/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content })
      });

      if (!response.ok) {
        const error = await response.json();
        
        // Check if it's a conflict error
        if (response.status === 409) {
          // Ask user via dialog
          const resolution = await onConflict([{
            path: fileName,
            destPath: path,
            exists: true
          }]);
          
          if (resolution === 'cancel' || resolution === 'skip') {
            return;
          }
          
          if (resolution === 'rename') {
            // Generate unique name
            const uniqueResponse = await fetchWithAuth(
              `/api/fileexplorer/unique-name?basePath=${encodeURIComponent(basePath)}&name=${encodeURIComponent(fileName)}`
            );
            const uniqueData = await uniqueResponse.json();
            const uniqueName = uniqueData.uniqueName;
            
            // Create with unique name
            const retryPath = `${basePath}/${uniqueName}`;
            const retryResponse = await fetchWithAuth('/api/fileexplorer/file', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: retryPath, content })
            });
            
            if (!retryResponse.ok) {
              throw new Error('Failed to create file with unique name');
            }
          } else if (resolution === 'overwrite') {
            // Delete existing and create new
            await fetchWithAuth('/api/fileexplorer/delete', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path })
            });
            
            const retryResponse = await fetchWithAuth('/api/fileexplorer/file', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path, content })
            });
            
            if (!retryResponse.ok) {
              throw new Error('Failed to create file after overwrite');
            }
          }
        } else {
          throw new Error(error.message || 'Create file failed');
        }
      }

      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Create file failed:', error);
      throw error;
    }
  }, [enabled, onRefresh]);

  const handleNewFolder = useCallback(async (targetFolder, folderName, onConflict) => {
    if (!enabled) return;

    try {
      const basePath = targetFolder.path;
      const path = `${basePath}/${folderName}`;

      const response = await fetchWithAuth('/api/fileexplorer/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });

      if (!response.ok) {
        const error = await response.json();
        
        // Check if it's a conflict error
        if (response.status === 409) {
          // Ask user via dialog
          const resolution = await onConflict([{
            path: folderName,
            destPath: path,
            exists: true
          }]);
          
          if (resolution === 'cancel' || resolution === 'skip') {
            return;
          }
          
          if (resolution === 'rename') {
            // Generate unique name
            const uniqueResponse = await fetchWithAuth(
              `/api/fileexplorer/unique-name?basePath=${encodeURIComponent(basePath)}&name=${encodeURIComponent(folderName)}`
            );
            const uniqueData = await uniqueResponse.json();
            const uniqueName = uniqueData.uniqueName;
            
            // Create with unique name
            const retryPath = `${basePath}/${uniqueName}`;
            const retryResponse = await fetchWithAuth('/api/fileexplorer/folder', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: retryPath })
            });
            
            if (!retryResponse.ok) {
              throw new Error('Failed to create folder with unique name');
            }
          } else if (resolution === 'overwrite') {
            // Delete existing and create new
            await fetchWithAuth('/api/fileexplorer/delete', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path })
            });
            
            const retryResponse = await fetchWithAuth('/api/fileexplorer/folder', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path })
            });
            
            if (!retryResponse.ok) {
              throw new Error('Failed to create folder after overwrite');
            }
          }
        } else {
          throw new Error(error.message || 'Create folder failed');
        }
      }

      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Create folder failed:', error);
      throw error;
    }
  }, [enabled, onRefresh]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((event) => {
    if (!enabled) return;
    
    if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
      event.preventDefault();
      handleCopy();
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'x') {
      event.preventDefault();
      handleCut();
    } else if (event.key === 'Delete') {
      event.preventDefault();
      handleDelete();
    }
  }, [enabled, handleCopy, handleCut, handleDelete]);

  return {
    selectedItems,
    clipboard,
    handleSelect,
    clearSelection,
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleRename,
    handleNewFile,
    handleNewFolder,
    handleKeyDown
  };
};

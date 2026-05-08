/**
 * @fileoverview Dialog for resolving file name conflicts during copy/move operations.
 */
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  RadioGroup,
  FormControlLabel,
  Radio,
  Typography,
  List,
  ListItem,
  ListItemText,
  Box
} from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';

const ConflictDialog = ({ open, conflicts, onResolve, onCancel }) => {
  const [resolution, setResolution] = useState('overwrite');

  const handleResolve = () => {
    onResolve(resolution);
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="warning" />
          <span>File Conflicts Detected</span>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The following files already exist in the destination:
        </Typography>
        
        <List dense sx={{ mb: 2, maxHeight: 200, overflow: 'auto', bgcolor: 'action.hover', borderRadius: 1 }}>
          {conflicts.map((conflict, idx) => (
            <ListItem key={idx}>
              <ListItemText 
                primary={conflict.path.split('/').pop()}
                secondary={conflict.destPath}
                primaryTypographyProps={{ variant: 'body2' }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </ListItem>
          ))}
        </List>

        <Typography variant="body2" sx={{ mb: 1 }}>
          How would you like to proceed?
        </Typography>

        <RadioGroup value={resolution} onChange={(e) => setResolution(e.target.value)}>
          <FormControlLabel 
            value="overwrite" 
            control={<Radio />} 
            label="Overwrite existing files" 
          />
          <FormControlLabel 
            value="rename" 
            control={<Radio />} 
            label="Rename new files (add number suffix)" 
          />
          <FormControlLabel 
            value="skip" 
            control={<Radio />} 
            label="Skip conflicting files" 
          />
        </RadioGroup>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={handleResolve} variant="contained">
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConflictDialog;

/**
 * @fileoverview The message shown when you switch to this agent.
 */
import { TextField } from '@mui/material';
import { setField } from '../../../domain/json.js';

/** @param {{spec: Object, onChange: (next: Object) => void}} props */
export const WelcomeSection = ({ spec, onChange }) => (
  <TextField size="small" label="Welcome message" multiline minRows={2}
    value={typeof spec.welcomeMessage === 'string' ? spec.welcomeMessage : ''}
    placeholder="What would you like to build today?"
    onChange={(e) => onChange(setField(spec, 'welcomeMessage', e.target.value))} />
);

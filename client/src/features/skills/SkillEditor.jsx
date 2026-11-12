/**
 * @fileoverview Edits a skill's SKILL.md: name and description as a form, the
 * instructions as text, one line on which agents use it. The skill's other
 * files are in the navigator under the skill. Delete removes the whole folder.
 */
import { useCallback } from 'react';
import { Box, Button } from '@mui/material';
import { Add, School } from '@mui/icons-material';
import { useSkill } from '../../data/useSkills';
import { useFileText, useSaveFile } from '../../data/useFiles';
import { errorMessage } from '../../data/errors';
import useDraft from '../../hooks/useDraft';
import { useEditorGuard } from '../../contexts/UnsavedChangesContext';
import { parseSkill } from '../../domain/skills.js';
import { EditorFrame, EditStatus, SaveButton } from '../../ui/EditorFrame';
import { CodeEditor } from '../../ui/CodeEditor';
import { Loading, ErrorState } from '../../ui/States';
import { useNotify } from '../../ui/NotifyProvider';
import { DeleteFileButton } from '../files/DeleteFileButton';
import { SkillForm } from './SkillForm';
import { SkillAgents } from './SkillAgents';

/**
 * @param {Object} props
 * @param {string} props.name the skill's folder name.
 * @param {() => void} props.onDeleted
 * @param {(skill: {name: string, dir: string}) => void} props.onAddFile open the Add file dialog.
 * @param {(id: string) => void} [props.onOpenAgent]
 */
export function SkillEditor({ name, onDeleted, onAddFile, onOpenAgent }) {
  const skill = useSkill(name);
  const file = useFileText(skill.data?.path, !!skill.data);
  if (skill.isLoading || file.isLoading) return <Loading />;
  if (skill.isError) return <ErrorState message={errorMessage(skill.error)} onRetry={skill.refetch} />;
  if (file.isError) return <ErrorState message={errorMessage(file.error)} onRetry={file.refetch} />;
  return <SkillBody key={skill.data.path} skill={skill.data} loaded={file.data.content} onDeleted={onDeleted} onAddFile={onAddFile} onOpenAgent={onOpenAgent} />;
}

function SkillBody({ skill, loaded, onDeleted, onAddFile, onOpenAgent }) {
  const save = useSaveFile();
  const notify = useNotify();
  const { draft, setDraft, dirty, markSaved } = useDraft(loaded, skill.path);
  const text = draft ?? '';
  const error = parseSkill(text).error;

  const onSave = useCallback(() => {
    save.mutate({ path: skill.path, content: text }, {
      onSuccess: () => { markSaved(text); notify(`${skill.name} saved. New chats see it.`, 'success'); },
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  }, [save, skill, text, markSaved, notify]);
  useEditorGuard({ dirty, canSave: dirty && !error && !save.isPending, onSave });

  return (
    <EditorFrame
      icon={<School />} title={`${skill.name}/SKILL.md`} path={skill.dir}
      status={<EditStatus dirty={dirty} error={error} />}
      actions={<>
        <Button color="inherit" startIcon={<Add />} onClick={() => onAddFile(skill)}>Add file</Button>
        <DeleteFileButton target={{ path: skill.dir, label: `the skill ${skill.name}`, folder: true }} onDeleted={onDeleted} beforeDelete={() => markSaved(text)} />
        <SaveButton dirty={dirty} valid={!error} saving={save.isPending} onClick={onSave} />
      </>}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <SkillForm text={text} onChange={setDraft} folder={skill.name} />
        <SkillAgents name={skill.name} onOpenAgent={onOpenAgent} />
        <Box sx={{ flexGrow: 1, minHeight: 160 }}><CodeEditor value={text} onChange={setDraft} language="markdown" /></Box>
      </Box>
    </EditorFrame>
  );
}

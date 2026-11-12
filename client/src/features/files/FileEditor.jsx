/**
 * @fileoverview Edits one file by absolute path as text (steering Markdown,
 * SKILL.md, or any file without a dedicated editor). The editor language
 * follows the file extension; JSON must parse before it can be saved. With
 * optional, a missing file opens empty and saving creates it. With steering,
 * a form above the text sets when Kiro loads the file; with prompt, how to
 * run it and its arguments; with skill, the SKILL.md front matter.
 */
import { useCallback, useRef } from 'react';
import { Box } from '@mui/material';
import { Description } from '@mui/icons-material';
import { useFileText, useSaveFile } from '../../data/useFiles';
import { DeleteFileButton } from './DeleteFileButton';
import { errorMessage } from '../../data/errors';
import useDraft from '../../hooks/useDraft';
import { useEditorGuard } from '../../contexts/UnsavedChangesContext';
import { parseJson } from '../../domain/json.js';
import { EditorFrame, EditStatus, SaveButton } from '../../ui/EditorFrame';
import { CodeEditor } from '../../ui/CodeEditor';
import { Loading, ErrorState, Hint } from '../../ui/States';
import { useNotify } from '../../ui/NotifyProvider';
import { extensionOf, baseName, isBinaryName, parentOf } from './paths';
import { SkillForm } from '../skills/SkillForm';
import { SteeringForm } from '../steering/SteeringForm';
import { PromptForm } from '../prompts/PromptForm';

const LANGUAGE = { json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown' };

/**
 * @param {Object} props
 * @param {string} props.path
 * @param {string} [props.title]
 * @param {boolean} [props.optional] the file may not exist yet.
 * @param {boolean} [props.steering] show the steering form above the text.
 * @param {boolean} [props.prompt] show how to run the prompt and its Arguments bar above the text.
 * @param {boolean} [props.skill] show the SKILL.md form above the text (a skill outside this scope).
 * @param {{path: string, label: string, folder?: boolean}} [props.deletable] offers Delete for this target.
 * @param {() => void} [props.onDeleted]
 */
export function FileEditor({ path, title, optional = false, steering = false, prompt = false, skill = false, deletable, onDeleted }) {
  const editor = useRef(null); // { insert } from the code editor
  const binary = isBinaryName(path);
  const file = useFileText(path, !binary, optional);
  const save = useSaveFile();
  const notify = useNotify();
  const { draft, setDraft, dirty, markSaved } = useDraft(file.data?.content, path);
  const language = LANGUAGE[extensionOf(path)] || 'text';
  const error = language === 'json' && draft !== undefined ? parseJson(draft).error : '';

  const onSave = useCallback(() => {
    save.mutate({ path, content: draft }, {
      onSuccess: () => { markSaved(draft); notify('Saved', 'success'); },
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  }, [save, path, draft, markSaved, notify]);
  useEditorGuard({ dirty, canSave: dirty && !error && !save.isPending, onSave });

  if (binary) {
    return (
      <EditorFrame icon={<Description />} title={title || baseName(path)} path={path}>
        <Hint text={`This file type (.${extensionOf(path)}) can't be edited here. Kiro can still use it.`} />
      </EditorFrame>
    );
  }
  if (file.isLoading) return <Loading />;
  if (file.isError) return <ErrorState message={errorMessage(file.error)} onRetry={file.refetch} />;

  return (
    <EditorFrame
      icon={<Description />} title={title || baseName(path)} path={path}
      status={<EditStatus dirty={dirty} error={error} isNew={optional && file.data?.exists === false} />}
      actions={<>
        {deletable && <DeleteFileButton target={deletable} onDeleted={onDeleted} beforeDelete={() => markSaved(draft)} />}
        <SaveButton dirty={dirty} valid={!error} saving={save.isPending} onClick={onSave} />
      </>}
    >
      {steering || prompt || skill ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          {skill && <SkillForm text={draft ?? ''} onChange={setDraft} folder={baseName(parentOf(path))} />}
          {steering && <SteeringForm text={draft ?? ''} onChange={setDraft} fileName={baseName(path)} />}
          {prompt && <PromptForm text={draft ?? ''} fileName={baseName(path)} onInsert={(t) => editor.current?.insert(t)} />}
          <Box sx={{ flexGrow: 1, minHeight: 0 }}><CodeEditor value={draft ?? ''} onChange={setDraft} language={language} handle={editor} /></Box>
        </Box>
      ) : <CodeEditor value={draft ?? ''} onChange={setDraft} language={language} />}
    </EditorFrame>
  );
}

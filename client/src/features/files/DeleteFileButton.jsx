/**
 * @fileoverview The Delete button of a file editor: confirms, deletes the file
 * (or a whole skill or spec folder) and tells the caller to close the editor.
 */
import { Button } from '@mui/material';
import { DeleteOutlined } from '@mui/icons-material';
import { useDeleteFile } from '../../data/useFiles';
import { errorMessage } from '../../data/errors';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useNotify } from '../../ui/NotifyProvider';

/**
 * @param {Object} props
 * @param {{path: string, label: string, folder?: boolean}} props.target what to delete and how to name it.
 * @param {() => void} props.onDeleted called after a successful delete (the file no longer exists).
 * @param {() => void} [props.beforeDelete] lets the editor drop its unsaved state first.
 */
export function DeleteFileButton({ target, onDeleted, beforeDelete }) {
  const remove = useDeleteFile();
  const confirm = useConfirm();
  const notify = useNotify();
  const onClick = async () => {
    const what = target.folder ? `${target.label} and everything in its folder` : target.label;
    if (!await confirm({ title: `Delete ${target.label}?`, body: `${what} will be deleted from disk. This can't be undone.`, confirmLabel: 'Delete', danger: true })) return;
    remove.mutate(target.path, {
      onSuccess: () => { beforeDelete?.(); notify(`${target.label} deleted`, 'success'); onDeleted(); },
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  };
  return <Button color="inherit" startIcon={<DeleteOutlined />} onClick={onClick} disabled={remove.isPending}>Delete</Button>;
}

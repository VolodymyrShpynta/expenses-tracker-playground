import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { Trans, useTranslation } from 'react-i18next';
import type { NameMatches } from './duplicateMatching';

interface DuplicateNameDialogProps {
  name: string;
  matches: NameMatches;
  pending: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onCreateAnyway: () => void;
  onUseExisting: () => void;
  onRestore: () => void;
}

/**
 * Two-step duplicate-resolution prompt: shown when the user submits Add
 * and one or more custom categories with the same (case-insensitive,
 * trimmed) name already exist. Three branches:
 *  - An *active* row exists       → "Use existing" / "Create anyway".
 *  - One *archived* row only      → "Restore" / "Create new".
 *  - Multiple *archived* rows     → "Restore & merge" (collapses every
 *                                   match into one) / "Create new".
 */
export function DuplicateNameDialog({
  name,
  matches,
  pending,
  errorMessage,
  onCancel,
  onCreateAnyway,
  onUseExisting,
  onRestore,
}: DuplicateNameDialogProps) {
  const { t: translate } = useTranslation();
  const { active, archived } = matches;
  const hasActive = active != null;
  const archivedOnly = !hasActive && archived.length > 0;
  const multipleArchived = archivedOnly && archived.length > 1;

  const titleKey = hasActive
    ? 'categoryDialog.duplicateActiveTitle'
    : multipleArchived
      ? 'categoryDialog.duplicateMultipleArchivedTitle'
      : 'categoryDialog.duplicateArchivedTitle';

  const bodyKey = hasActive
    ? 'categoryDialog.duplicateActiveBody'
    : multipleArchived
      ? 'categoryDialog.duplicateMultipleArchivedBody'
      : 'categoryDialog.duplicateArchivedBody';

  return (
    <Dialog open onClose={onCancel} maxWidth="xs">
      <DialogTitle>{translate(titleKey)}</DialogTitle>
      <DialogContent>
        <Typography>
          <Trans
            i18nKey={bodyKey}
            values={{ name: name.trim(), count: archived.length }}
            components={{ 1: <strong /> }}
          />
        </Typography>
        {errorMessage && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {errorMessage}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={pending}>
          {translate('common.cancel')}
        </Button>
        {archivedOnly ? (
          <>
            <Button onClick={onCreateAnyway} disabled={pending}>
              {translate('categoryDialog.createNewButton')}
            </Button>
            <Button variant="contained" onClick={onRestore} disabled={pending}>
              {pending
                ? translate('common.saving')
                : multipleArchived
                  ? translate('categoryDialog.restoreAndMergeButton')
                  : translate('categoryDialog.restoreButton')}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onCreateAnyway} disabled={pending}>
              {translate('categoryDialog.createAnywayButton')}
            </Button>
            <Button variant="contained" onClick={onUseExisting} disabled={pending}>
              {translate('categoryDialog.useExistingButton')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

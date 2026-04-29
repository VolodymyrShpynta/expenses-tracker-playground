import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Badge from '@mui/material/Badge';
import Tooltip from '@mui/material/Tooltip';
import { alpha, useTheme } from '@mui/material/styles';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CallMergeIcon from '@mui/icons-material/CallMerge';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { useTranslation } from 'react-i18next';
import type { Category } from '../../types/category.ts';
import type { CategoryLookup } from '../../hooks/useCategoryLookup.ts';

/**
 * Single row in the {@link ManageCategoriesDialog} list. Shows the
 * resolved icon/name plus inline actions (edit, merge, delete) and an
 * optional badge to absorb same-named archived twins.
 *
 * Pure presentational component — all state lives in the parent.
 */
interface CategoryRowProps {
  category: Category;
  categoryLookup: CategoryLookup;
  /** Number of archived same-named siblings; when > 0 the absorb-twins button is shown. */
  archivedCount: number;
  onEdit: (c: Category) => void;
  onMerge: (c: Category) => void;
  onMergeArchived: (c: Category) => void;
  onDelete: (c: Category) => void;
}

export function CategoryRow({
  category,
  categoryLookup,
  archivedCount,
  onEdit,
  onMerge,
  onMergeArchived,
  onDelete,
}: CategoryRowProps) {
  const { t: translate } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const resolved = categoryLookup.resolve(category.id);
  const Icon = resolved.icon;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, px: 3 }}>
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          backgroundColor: alpha(resolved.color, isDark ? 0.25 : 0.15),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon sx={{ fontSize: 20, color: resolved.color }} />
      </Box>

      <Typography variant="body1" fontWeight={500} sx={{ flex: 1 }} noWrap>
        {resolved.name}
      </Typography>

      {archivedCount > 0 && (
        <Tooltip
          title={translate('categoryDialog.mergeArchivedTooltip', { count: archivedCount })}
        >
          <IconButton
            size="small"
            onClick={() => onMergeArchived(category)}
            aria-label={translate('categoryDialog.mergeArchivedAriaLabel', {
              name: resolved.name,
              count: archivedCount,
            })}
          >
            <Badge badgeContent={archivedCount} color="warning">
              <Inventory2OutlinedIcon fontSize="small" />
            </Badge>
          </IconButton>
        </Tooltip>
      )}

      <IconButton
        size="small"
        onClick={() => onEdit(category)}
        aria-label={translate('categoryDialog.editAriaLabel', { name: resolved.name })}
      >
        <EditIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={() => onMerge(category)}
        aria-label={translate('categoryDialog.mergeAriaLabel', { name: resolved.name })}
      >
        <CallMergeIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={() => onDelete(category)}
        sx={{ color: 'error.main' }}
        aria-label={translate('categoryDialog.deleteAriaLabel', { name: resolved.name })}
      >
        <DeleteIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

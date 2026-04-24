import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

export default function OverviewPage() {
  const { t: translate } = useTranslation();
  return (
    <Box sx={{ py: 2, px: 1 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
        {translate('expenses.overviewTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {translate('expenses.overviewComingSoon')}
      </Typography>
    </Box>
  );
}

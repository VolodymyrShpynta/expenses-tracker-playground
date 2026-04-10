import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function OverviewPage() {
  return (
    <Box sx={{ py: 2, px: 1 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
        Overview
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Budget overview and analytics coming soon.
      </Typography>
    </Box>
  );
}

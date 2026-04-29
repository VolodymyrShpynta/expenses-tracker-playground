import { forwardRef } from 'react';
import type { ReactElement, Ref } from 'react';
import Slide from '@mui/material/Slide';
import type { TransitionProps } from '@mui/material/transitions';

/**
 * Bottom-sheet slide-up transition shared by every mobile dialog in the
 * app. `forwardRef` is required so MUI's `Slide` can attach the
 * transition ref to the dialog's paper.
 */
export const SlideUp = forwardRef(function SlideUp(
  props: TransitionProps & { children: ReactElement },
  ref: Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

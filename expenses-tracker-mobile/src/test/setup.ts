import { afterEach } from 'vitest';

import { closeTestStores } from './sqliteTestStore';

afterEach(closeTestStores);

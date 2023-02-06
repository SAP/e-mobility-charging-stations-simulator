// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import chalk from 'chalk';

import { Bootstrap } from './internal';

Bootstrap.getInstance()
  .start()
  .catch((error) => {
    console.error(chalk.red('Startup error: '), error);
  });

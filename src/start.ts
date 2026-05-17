// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import chalk from 'chalk'

import { Bootstrap } from './charging-station/index.js'

try {
  const bootstrap = Bootstrap.getInstance()
  bootstrap.startUIServer()
  if (bootstrap.shouldAutoStart()) {
    await bootstrap.start()
  }
} catch (error) {
  console.error(chalk.red('Startup error: '), error)
}

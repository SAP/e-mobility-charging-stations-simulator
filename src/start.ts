import Bootstrap from './charging-station/Bootstrap';
import chalk from 'chalk';

Bootstrap.getInstance().start().catch(
  (error) => {
    console.error(chalk.red(error));
  }
);

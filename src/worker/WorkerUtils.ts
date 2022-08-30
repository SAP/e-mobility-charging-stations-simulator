import { threadId } from 'worker_threads';

import chalk from 'chalk';

export class WorkerUtils {
  private constructor() {
    // This is intentional
  }

  public static defaultExitHandler = (code: number): void => {
    if (code !== 0) {
      console.error(chalk.red(`Worker ${threadId} stopped with exit code ${code}`));
    }
  };
}

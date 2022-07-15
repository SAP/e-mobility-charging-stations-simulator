import chalk from 'chalk';

export class WorkerUtils {
  private constructor() {
    // This is intentional
  }

  public static defaultExitHandler = (code: number): void => {
    if (code !== 0) {
      console.error(chalk.red(`Worker stopped with exit code ${code}`));
    }
  };
}

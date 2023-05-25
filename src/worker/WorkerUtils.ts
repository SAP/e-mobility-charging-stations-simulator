import chalk from 'chalk';

export class WorkerUtils {
  private constructor() {
    // This is intentional
  }

  public static async sleep(milliSeconds: number): Promise<NodeJS.Timeout> {
    return new Promise((resolve) => setTimeout(resolve as () => void, milliSeconds));
  }

  public static defaultExitHandler = (code: number): void => {
    if (code === 0) {
      console.info(chalk.green('Worker exited successfully'));
    } else if (code === 1) {
      console.info(chalk.green('Worker terminated successfully'));
    } else if (code > 1) {
      console.error(chalk.red(`Worker exited with exit code: ${code.toString()}`));
    }
  };

  public static defaultErrorHandler = (error: Error): void => {
    console.error(chalk.red('Worker errored: ', error));
  };
}

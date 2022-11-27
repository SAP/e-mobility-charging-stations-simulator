import chalk from 'chalk';

export class WorkerUtils {
  private constructor() {
    // This is intentional
  }

  public static defaultExitHandler = (code: number): void => {
    if (code !== 0) {
      console.error(chalk.red(`Worker exited with error exit code: ${code.toString()}`));
    }
  };

  public static defaultErrorHandler = (error: Error): void => {
    console.error(chalk.red('Worker errored: ', error));
  };
}

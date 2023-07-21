import chalk from 'chalk';

export const sleep = async (milliSeconds: number): Promise<NodeJS.Timeout> => {
  return new Promise<NodeJS.Timeout>((resolve) => setTimeout(resolve as () => void, milliSeconds));
};

export const defaultExitHandler = (code: number): void => {
  if (code === 0) {
    console.info(chalk.green('Worker exited successfully'));
  } else if (code === 1) {
    console.info(chalk.green('Worker terminated successfully'));
  } else if (code > 1) {
    console.error(chalk.red(`Worker exited with exit code: ${code.toString()}`));
  }
};

export const defaultErrorHandler = (error: Error): void => {
  console.error(chalk.red('Worker errored: ', error));
};

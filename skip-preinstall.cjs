const isCFEnvironment = process.env.VCAP_APPLICATION !== undefined;
if (process.env.SKIP_PREINSTALL || isCFEnvironment) {
  // eslint-disable-next-line n/no-process-exit
  process.exit(0);
} else {
  // eslint-disable-next-line n/no-process-exit
  process.exit(1);
}

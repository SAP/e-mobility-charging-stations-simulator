const skipPreinstall = process.env.SKIP_PREINSTALL || process.env.VCAP_APPLICATION !== undefined;
if (skipPreinstall) {
  // eslint-disable-next-line n/no-process-exit
  process.exit(0);
} else {
  // eslint-disable-next-line n/no-process-exit
  process.exit(1);
}

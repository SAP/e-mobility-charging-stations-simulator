export class OCPPServiceUtils {
  protected static getLimitFromSampledValueTemplateCustomValue(
    value: string,
    limit: number,
    options: { limitationEnabled?: boolean; unitMultiplier?: number } = {
      limitationEnabled: true,
      unitMultiplier: 1,
    }
  ): number {
    options.limitationEnabled = options?.limitationEnabled ?? true;
    options.unitMultiplier = options?.unitMultiplier ?? 1;
    return options?.limitationEnabled
      ? Math.min(parseInt(value) * options.unitMultiplier, limit)
      : parseInt(value) * options.unitMultiplier;
  }
}

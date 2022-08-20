import { DefinedError, ErrorObject } from 'ajv';

import { ErrorType } from '../../types/ocpp/ErrorType';

export class OCPPServiceUtils {
  protected constructor() {
    // This is intentional
  }

  public static AjvErrorsToErrorType(errors: ErrorObject[]): ErrorType {
    for (const error of errors as DefinedError[]) {
      switch (error.keyword) {
        case 'type':
          return ErrorType.TYPE_CONSTRAINT_VIOLATION;
        case 'dependencies':
        case 'required':
          return ErrorType.OCCURRENCE_CONSTRAINT_VIOLATION;
        case 'pattern':
        case 'format':
          return ErrorType.PROPERTY_CONSTRAINT_VIOLATION;
      }
    }
    return ErrorType.FORMAT_VIOLATION;
  }

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
    const numberValue = isNaN(parseInt(value)) ? Infinity : parseInt(value);
    return options?.limitationEnabled
      ? Math.min(numberValue * options.unitMultiplier, limit)
      : numberValue * options.unitMultiplier;
  }
}

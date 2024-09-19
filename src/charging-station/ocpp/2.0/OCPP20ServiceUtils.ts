// Partial Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import type { JSONSchemaType } from 'ajv'

import { type JsonType, OCPPVersion } from '../../../types/index.js'
import { OCPPServiceUtils } from '../OCPPServiceUtils.js'

export class OCPP20ServiceUtils extends OCPPServiceUtils {
  public static override parseJsonSchemaFile<T extends JsonType>(
    relativePath: string,
    moduleName?: string,
    methodName?: string
  ): JSONSchemaType<T> {
    return super.parseJsonSchemaFile<T>(
      relativePath,
      OCPPVersion.VERSION_201,
      moduleName,
      methodName
    )
  }
}

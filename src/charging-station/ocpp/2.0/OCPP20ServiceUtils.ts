// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { JSONSchemaType } from 'ajv';

import { FileType } from '../../../types/FileType';
import type { JsonType } from '../../../types/JsonType';
import { OCPPVersion } from '../../../types/ocpp/OCPPVersion';
import FileUtils from '../../../utils/FileUtils';
import { OCPPServiceUtils } from '../OCPPServiceUtils';

export class OCPP20ServiceUtils extends OCPPServiceUtils {
  public static parseJsonSchemaFile<T extends JsonType>(relativePath: string): JSONSchemaType<T> {
    const filePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), relativePath);
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as JSONSchemaType<T>;
    } catch (error) {
      FileUtils.handleFileException(
        OCPPServiceUtils.logPrefix(OCPPVersion.VERSION_20),
        FileType.JsonSchema,
        filePath,
        error as NodeJS.ErrnoException,
        { throwError: false }
      );
    }
  }
}

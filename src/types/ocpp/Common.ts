import type { JsonObject } from '../JsonType.js'

export enum GenericStatus {
  Accepted = 'Accepted',
  Rejected = 'Rejected',
}

export enum RegistrationStatusEnumType {
  ACCEPTED = 'Accepted',
  PENDING = 'Pending',
  REJECTED = 'Rejected',
}

export interface GenericResponse extends JsonObject {
  status: GenericStatus
}

import ChargingStation from './ChargingStation';
import { ConfigurationKey } from '../types/ChargingStationOcppConfiguration';
import { StandardParametersKey } from '../types/ocpp/Configuration';
import logger from '../utils/Logger';

export class ChargingStationConfigurationUtils {
  public static getConfigurationKey(
    chargingStation: ChargingStation,
    key: string | StandardParametersKey,
    caseInsensitive = false
  ): ConfigurationKey | undefined {
    return chargingStation.ocppConfiguration.configurationKey.find((configElement) => {
      if (caseInsensitive) {
        return configElement.key.toLowerCase() === key.toLowerCase();
      }
      return configElement.key === key;
    });
  }

  public static addConfigurationKey(
    chargingStation: ChargingStation,
    key: string | StandardParametersKey,
    value: string,
    options: { readonly?: boolean; visible?: boolean; reboot?: boolean } = {
      readonly: false,
      visible: true,
      reboot: false,
    },
    params: { overwrite?: boolean; save?: boolean } = { overwrite: false, save: false }
  ): void {
    options = options ?? ({} as { readonly?: boolean; visible?: boolean; reboot?: boolean });
    options.readonly = options?.readonly ?? false;
    options.visible = options?.visible ?? true;
    options.reboot = options?.reboot ?? false;
    let keyFound = ChargingStationConfigurationUtils.getConfigurationKey(chargingStation, key);
    if (keyFound && params?.overwrite) {
      ChargingStationConfigurationUtils.deleteConfigurationKey(chargingStation, keyFound.key, {
        save: false,
      });
      keyFound = undefined;
    }
    if (!keyFound) {
      chargingStation.ocppConfiguration.configurationKey.push({
        key,
        readonly: options.readonly,
        value,
        visible: options.visible,
        reboot: options.reboot,
      });
      params?.save && chargingStation.saveOcppConfiguration();
    } else {
      logger.error(
        `${chargingStation.logPrefix()} Trying to add an already existing configuration key: %j`,
        keyFound
      );
    }
  }

  public static setConfigurationKeyValue(
    chargingStation: ChargingStation,
    key: string | StandardParametersKey,
    value: string,
    caseInsensitive = false
  ): void {
    const keyFound = ChargingStationConfigurationUtils.getConfigurationKey(
      chargingStation,
      key,
      caseInsensitive
    );
    if (keyFound) {
      chargingStation.ocppConfiguration.configurationKey[
        chargingStation.ocppConfiguration.configurationKey.indexOf(keyFound)
      ].value = value;
      chargingStation.saveOcppConfiguration();
    } else {
      logger.error(
        `${chargingStation.logPrefix()} Trying to set a value on a non existing configuration key: %j`,
        { key, value }
      );
    }
  }

  public static deleteConfigurationKey(
    chargingStation: ChargingStation,
    key: string | StandardParametersKey,
    params: { save?: boolean; caseInsensitive?: boolean } = { save: true, caseInsensitive: false }
  ): ConfigurationKey[] {
    const keyFound = ChargingStationConfigurationUtils.getConfigurationKey(
      chargingStation,
      key,
      params?.caseInsensitive
    );
    if (keyFound) {
      const deletedConfigurationKey = chargingStation.ocppConfiguration.configurationKey.splice(
        chargingStation.ocppConfiguration.configurationKey.indexOf(keyFound),
        1
      );
      params?.save && chargingStation.saveOcppConfiguration();
      return deletedConfigurationKey;
    }
  }
}

import 'reflect-metadata';
import { initializeDatabase } from '../src/data/config/database.js';
import { saveTemplate } from '../src/data/repository/TemplateRepository.js';
import fs from 'fs/promises';
import path from 'path';

async function seedTemplates() {
  await initializeDatabase();
  console.log('Database connected');

  const templateDir = path.join(process.cwd(), 'src/assets/station-templates');
  const files = await fs.readdir(templateDir);

  for (const file of files) {
    if (file.endsWith('.json')) {
      const data = await fs.readFile(path.join(templateDir, file), 'utf-8');
      const parsed = JSON.parse(data);

      const templateName = file.replace('.station-template.json', '');
      await saveTemplate({
        name: templateName,
        supervisionUrlOcppConfiguration: parsed.supervisionUrlOcppConfiguration,
        supervisionUrlOcppKey: parsed.supervisionUrlOcppKey,
        idTagsFile: parsed.idTagsFile,
        baseName: parsed.baseName,
        chargePointModel: parsed.chargePointModel,
        chargePointVendor: parsed.chargePointVendor,
        chargeBoxSerialNumberPrefix: parsed.chargeBoxSerialNumberPrefix,
        firmwareVersionPattern: parsed.firmwareVersionPattern,
        firmwareVersion: parsed.firmwareVersion,
        power: parsed.power,
        powerUnit: parsed.powerUnit,
        numberOfConnectors: parsed.numberOfConnectors,
        randomConnectors: parsed.randomConnectors,
        voltageOut: parsed.voltageOut,
        amperageLimitationOcppKey: parsed.amperageLimitationOcppKey,
        Configuration: parsed.Configuration,
        AutomaticTransactionGenerator: parsed.AutomaticTransactionGenerator,
        Connectors: parsed.Connectors,
      });

      console.log(`Seeded template: ${templateName}`);
    }
  }

  console.log('All templates seeded.');
  process.exit(0);
}

seedTemplates().catch(err => {
  console.error(err);
  process.exit(1);
});
// src/data/repository/TemplateRepository.ts
import { AppDataSource } from '../data-source.js'
import { Template } from '../entity/template.js'

export const TemplateRepository = AppDataSource.getRepository(Template)

/**
 *
 */
export async function getAllTemplates (): Promise<Template[]> {
  return TemplateRepository.find()
}

/**
 *
 * @param name
 */
export async function getTemplateByName (name: string): Promise<null | Template> {
  return TemplateRepository.findOneBy({ name })
}

/**
 *
 * @param templateData
 */
export async function saveTemplate (templateData: Partial<Template>): Promise<Template> {
  const template = TemplateRepository.create(templateData)
  return TemplateRepository.save(template)
}

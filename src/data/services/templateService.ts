/* eslint-disable @typescript-eslint/no-extraneous-class */
import { Template } from '../entity/template.js'
import { TemplateRepository } from '../repository/templateRepository.js'

export class TemplateService {
  static async createTemplate (templateData: Partial<Template>): Promise<Template> {
    const template = TemplateRepository.create(templateData)
    return TemplateRepository.save(template)
  }

  static async deleteTemplate (id: number): Promise<boolean> {
    const result = await TemplateRepository.delete(id)
    return result.affected !== 0
  }

  static async getAllTemplates (): Promise<Template[]> {
    return TemplateRepository.find()
  }

  static async getTemplateByName (name: string): Promise<null | Template> {
    return TemplateRepository.findOneBy({ name })
  }

  static async updateTemplate (id: number, updateData: Partial<Template>): Promise<null | Template> {
    const template = await TemplateRepository.findOneBy({ id })
    if (!template) return null
    TemplateRepository.merge(template, updateData)
    return TemplateRepository.save(template)
  }
}

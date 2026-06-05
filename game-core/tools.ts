import { collectionTools } from '../data/tools';
import type { ToolId } from './types';

export const documentationTool = {
  id: 'sketch',
  name: 'Field Journal',
  description: 'Observe, sketch, and document without taking the specimen.',
  detailedDescription: 'A pocket field book for locality, behavior, and specimen condition notes.',
  action: 'documented',
  icon: 'field-notes',
  usage: 'Best for cautious observation and educational progress.',
};

export const expeditionTools = [
  ...collectionTools,
  documentationTool,
];

export function getToolById(toolId: ToolId) {
  return expeditionTools.find(tool => tool.id === toolId) || null;
}

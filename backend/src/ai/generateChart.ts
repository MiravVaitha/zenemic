import { z } from 'zod';
import { completeStructured } from './client';
import { CHART_GENERATION_SYSTEM } from './prompts';

export const ChartSchema = z.object({
  stages: z
    .array(
      z.object({
        tag: z.enum(['SETUP', 'PRE', 'TRAVEL', 'LIVE', 'KEY', 'WRAP']),
        t: z.string(),
        heading: z.string(),
        body: z.string(),
        kind: z.enum(['PAST', 'CURRENT', 'NEXT']),
      }),
    )
    .min(3)
    .max(6),
});

export type GeneratedChart = z.infer<typeof ChartSchema>;

const CHART_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    stages: {
      type: 'array',
      minItems: 4,
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          tag: { type: 'string', enum: ['SETUP', 'PRE', 'TRAVEL', 'LIVE', 'KEY', 'WRAP'] },
          t: { type: 'string', description: 'Short time label, e.g. "T -2H"' },
          heading: { type: 'string' },
          body: { type: 'string' },
          kind: { type: 'string', enum: ['PAST', 'CURRENT', 'NEXT'] },
        },
        required: ['tag', 't', 'heading', 'body', 'kind'],
        additionalProperties: false,
      },
    },
  },
  required: ['stages'],
  additionalProperties: false,
};

export interface ChartInput {
  title: string;
  dateLabel: string;
  timeLabel: string;
  location: string;
  attendees: number;
  budgetLabel?: string | null;
  splitMode: string;
  sourceMessage?: string | null;
  kind: 'PLANNED' | 'ONGOING' | 'PREVIOUS';
}

/** Generate the bespoke planner-chart timeline shown on the detail/chart screens. */
export async function generateChart(input: ChartInput): Promise<GeneratedChart> {
  const user = [
    `Title: ${input.title}`,
    `Date: ${input.dateLabel}`,
    `Time: ${input.timeLabel}`,
    `Location: ${input.location}`,
    `Attendees: ${input.attendees}`,
    input.budgetLabel ? `Budget: ${input.budgetLabel}` : null,
    `Split: ${input.splitMode}`,
    `Status: ${input.kind}`,
    input.sourceMessage ? `\nHost's original message:\n"""${input.sourceMessage}"""` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return completeStructured({
    schema: ChartSchema,
    jsonSchema: CHART_JSON_SCHEMA,
    toolName: 'record_planner_chart',
    toolDescription: 'Record the ordered run-of-show stages for this event.',
    system: CHART_GENERATION_SYSTEM,
    user,
  });
}

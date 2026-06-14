import Anthropic from '@anthropic-ai/sdk';
import type { ZodType } from 'zod';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { logger } from '../config/logger';

/**
 * Shared Anthropic client. Powers every AI feature in Zenemic:
 *   - structured extraction of event details from free text
 *   - planner-chart generation
 *   - the "Ask Zenemic" chat assistant (tool use)
 *   - receipt itemisation from photos (vision)
 *
 * We default to claude-opus-4-8 (the most capable model). Structured outputs use
 * the forced tool-use pattern, which is stable across SDK versions.
 */
export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export const MODELS = {
  default: env.ANTHROPIC_MODEL,
  // Extraction is high-volume + simple; allow a cheaper model if configured.
  extraction: env.ANTHROPIC_EXTRACTION_MODEL || env.ANTHROPIC_MODEL,
} as const;

interface CompleteStructuredOptions<T> {
  /** Zod schema used to validate (and type) the model's output. */
  schema: ZodType<T>;
  /** JSON Schema describing the tool's required output shape. */
  jsonSchema: Record<string, unknown>;
  toolName: string;
  toolDescription: string;
  system: string;
  user: string | Anthropic.ContentBlockParam[];
  model?: string;
  maxTokens?: number;
}

/**
 * Get a structured object back from Claude by defining a single tool whose input
 * schema is the desired shape, then forcing the model to call it. We read the
 * tool-call input and validate it with zod. Works on every recent SDK version.
 */
export async function completeStructured<T>(opts: CompleteStructuredOptions<T>): Promise<T> {
  const response = await anthropic.messages.create({
    model: opts.model ?? MODELS.default,
    max_tokens: opts.maxTokens ?? env.ANTHROPIC_MAX_TOKENS,
    system: opts.system,
    tools: [
      {
        name: opts.toolName,
        description: opts.toolDescription,
        // JSON Schema is intentionally loose in the SDK types; cast through.
        input_schema: opts.jsonSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: opts.toolName },
    messages: [{ role: 'user', content: opts.user }],
  });

  if (response.stop_reason === 'refusal') {
    throw new AppError(422, 'The model declined to process this request.', 'ai_refusal');
  }

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );
  if (!toolUse) {
    logger.warn({ stop: response.stop_reason }, 'completeStructured: no tool_use block');
    throw new AppError(502, 'The AI returned an unusable response. Please retry.', 'ai_unparsable');
  }

  const parsed = opts.schema.safeParse(toolUse.input);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, 'completeStructured: schema mismatch');
    throw new AppError(502, 'The AI response did not match the expected shape.', 'ai_invalid');
  }
  return parsed.data;
}

/** Plain-text single-turn completion (used for drafting messages, summaries). */
export async function completeText(opts: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const response = await anthropic.messages.create({
    model: opts.model ?? MODELS.default,
    max_tokens: opts.maxTokens ?? env.ANTHROPIC_MAX_TOKENS,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  });
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!text) throw new AppError(502, 'Empty AI response.', 'ai_empty');
  return text;
}

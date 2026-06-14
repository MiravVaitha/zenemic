import type Anthropic from '@anthropic-ai/sdk';
import { anthropic, MODELS } from './client';
import { env } from '../config/env';
import { logger } from '../config/logger';

export type ToolExecutor = (name: string, input: unknown) => Promise<string>;

export interface RunChatOptions {
  system: string;
  /** Full prior conversation as Anthropic message params (user/assistant turns). */
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  executeTool: ToolExecutor;
  maxIterations?: number;
}

export interface RunChatResult {
  text: string;
  /** Names of tools the assistant invoked during this turn (for the UI/audit). */
  toolsUsed: string[];
}

/**
 * Drive one assistant turn of "Ask Zenemic" with a manual agentic loop. We use a
 * manual loop (rather than the SDK tool runner) so the chat service controls
 * each tool call — reads hit the DB, and money/calendar mutations stay gated.
 */
export async function runEventChat(opts: RunChatOptions): Promise<RunChatResult> {
  const maxIterations = opts.maxIterations ?? 6;
  const messages: Anthropic.MessageParam[] = [...opts.messages];
  const toolsUsed: string[] = [];

  for (let i = 0; i < maxIterations; i += 1) {
    const response = await anthropic.messages.create({
      model: MODELS.default,
      max_tokens: env.ANTHROPIC_MAX_TOKENS,
      system: opts.system,
      tools: opts.tools,
      messages,
    });

    if (response.stop_reason === 'refusal') {
      return { text: "I can't help with that one, sorry.", toolsUsed };
    }

    if (response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      return { text, toolsUsed };
    }

    // Append the assistant's turn (incl. tool_use + thinking blocks) verbatim.
    messages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      toolsUsed.push(block.name);
      try {
        const result = await opts.executeTool(block.name, block.input);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      } catch (err) {
        logger.warn({ err, tool: block.name }, 'chat tool failed');
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Error: ${(err as Error).message}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: 'user', content: toolResults });
  }

  // Hit the iteration cap — return a graceful fallback.
  return {
    text: "I've gathered what I need but couldn't wrap that up cleanly — want to try rephrasing?",
    toolsUsed,
  };
}

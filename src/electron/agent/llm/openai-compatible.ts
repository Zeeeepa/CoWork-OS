import {
  LLMContent,
  LLMMessage,
  LLMResponse,
  LLMTool,
} from './types';

export function toOpenAICompatibleMessages(
  messages: LLMMessage[],
  system?: string
): Array<{ role: string; content: any; tool_call_id?: string; tool_calls?: any[] }> {
  const result: Array<{ role: string; content: any; tool_call_id?: string; tool_calls?: any[] }> = [];

  if (system) {
    result.push({ role: 'system', content: system });
  }

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    for (const item of msg.content) {
      if (item.type === 'tool_result') {
        result.push({
          role: 'tool',
          content: item.content,
          tool_call_id: item.tool_use_id,
        });
      } else if (item.type === 'tool_use') {
        result.push({
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: item.id,
            type: 'function',
            function: {
              name: item.name,
              arguments: JSON.stringify(item.input),
            },
          }],
        });
      } else if (item.type === 'text') {
        result.push({ role: msg.role, content: item.text });
      }
    }
  }

  return result;
}

export function toOpenAICompatibleTools(tools: LLMTool[]): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}> {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

export function fromOpenAICompatibleResponse(response: any): LLMResponse {
  const content: LLMContent[] = [];
  const choice = response.choices?.[0];

  if (!choice) {
    return {
      content: [{ type: 'text', text: '' }],
      stopReason: 'end_turn',
    };
  }

  const message = choice.message;

  if (message?.content) {
    content.push({
      type: 'text',
      text: message.content,
    });
  }

  if (message?.tool_calls) {
    for (const toolCall of message.tool_calls) {
      if (toolCall.type === 'function') {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments || '{}'),
        });
      }
    }
  }

  if (content.length === 0) {
    content.push({ type: 'text', text: '' });
  }

  return {
    content,
    stopReason: mapStopReason(choice.finish_reason),
    usage: response.usage
      ? {
          inputTokens: response.usage.prompt_tokens || 0,
          outputTokens: response.usage.completion_tokens || 0,
        }
      : undefined,
  };
}

export function mapStopReason(finishReason?: string): LLMResponse['stopReason'] {
  switch (finishReason) {
    case 'stop':
      return 'end_turn';
    case 'length':
      return 'max_tokens';
    case 'tool_calls':
      return 'tool_use';
    case 'content_filter':
      return 'stop_sequence';
    default:
      return 'end_turn';
  }
}

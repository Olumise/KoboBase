import { encoding_for_model, TiktokenModel } from 'tiktoken';
import { BaseMessage } from '@langchain/core/messages';

export async function countTokensForMessages(
  messages: BaseMessage[],
  model: string = 'gpt-4o'
): Promise<number> {
  try {
    const tiktokenModel = mapModelToTiktokenModel(model);
    const encoding = encoding_for_model(tiktokenModel);

    let tokenCount = 0;

    for (const message of messages) {
      tokenCount += 4;

      if (typeof message.content === 'string') {
        tokenCount += encoding.encode(message.content).length;
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (typeof part === 'string') {
            tokenCount += encoding.encode(part).length;
          } else if (typeof part === 'object' && part !== null) {
            if ('text' in part && typeof part.text === 'string') {
              tokenCount += encoding.encode(part.text).length;
            } else if ('image_url' in part) {
              tokenCount += 85;
            }
          }
        }
      }

      if (message.additional_kwargs) {
        const kwargsString = JSON.stringify(message.additional_kwargs);
        tokenCount += encoding.encode(kwargsString).length;
      }
    }

    tokenCount += 3;

    encoding.free();
    return tokenCount;
  } catch (error) {
    console.error('Error counting tokens for messages:', error);
    return estimateTokensFromMessages(messages);
  }
}

export async function countTokensForText(
  text: string,
  model: string = 'gpt-4o'
): Promise<number> {
  try {
    const tiktokenModel = mapModelToTiktokenModel(model);
    const encoding = encoding_for_model(tiktokenModel);
    const tokens = encoding.encode(text);
    const count = tokens.length;
    encoding.free();
    return count;
  } catch (error) {
    console.error('Error counting tokens for text:', error);
    return Math.ceil(text.length / 4);
  }
}

export function estimateStructuredOutputTokens(schema: any): number {
  try {
    const schemaString = JSON.stringify(schema);
    return Math.ceil(schemaString.length / 4);
  } catch (error) {
    console.error('Error estimating structured output tokens:', error);
    return 100;
  }
}

export function extractTokenUsageFromResponse(response: any): {
  inputTokens: number;
  outputTokens: number;
} | null {
  try {
    if (response?.usage_metadata) {
      return {
        inputTokens: response.usage_metadata.input_tokens || 0,
        outputTokens: response.usage_metadata.output_tokens || 0,
      };
    }

    if (response?.response_metadata?.usage) {
      return {
        inputTokens: response.response_metadata.usage.prompt_tokens || 0,
        outputTokens: response.response_metadata.usage.completion_tokens || 0,
      };
    }

    if (response?.lc_kwargs?.usage_metadata) {
      return {
        inputTokens: response.lc_kwargs.usage_metadata.input_tokens || 0,
        outputTokens: response.lc_kwargs.usage_metadata.output_tokens || 0,
      };
    }

    return null;
  } catch (error) {
    console.error('Error extracting token usage from response:', error);
    return null;
  }
}

export function estimateOutputTokens(response: any): number {
  try {
    let content = '';

    if (typeof response?.content === 'string') {
      content = response.content;
    } else if (response?.text) {
      content = response.text;
    } else if (response?.message?.content) {
      content = response.message.content;
    }

    return Math.ceil(content.length / 4);
  } catch (error) {
    console.error('Error estimating output tokens:', error);
    return 0;
  }
}

function estimateTokensFromMessages(messages: BaseMessage[]): number {
  let totalChars = 0;

  for (const message of messages) {
    const content: any = message.content;
    if (typeof content === 'string') {
      totalChars += content.length;
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === 'string') {
          totalChars += part.length;
        } else if (typeof part === 'object' && part !== null) {
          const obj = part as any;
          if ('text' in obj && typeof obj.text === 'string') {
            totalChars += obj.text.length;
          }
        }
      }
    }
  }

  return Math.ceil(totalChars / 4) + messages.length * 4;
}

function mapModelToTiktokenModel(model: string): TiktokenModel {
  const modelMap: Record<string, TiktokenModel> = {
    'gpt-4o': 'gpt-4o',
    'gpt-4.1': 'gpt-4',
    'gpt-4': 'gpt-4',
    'gpt-3.5-turbo': 'gpt-3.5-turbo',
  };

  return modelMap[model] || 'gpt-4o';
}

export function estimateTokensForTools(tools: any[]): number {
  try {
    const toolsString = JSON.stringify(tools);
    return Math.ceil(toolsString.length / 4);
  } catch (error) {
    console.error('Error estimating tokens for tools:', error);
    return tools.length * 50;
  }
}

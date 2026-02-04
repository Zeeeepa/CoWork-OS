import {
  LLMProvider,
  LLMProviderConfig,
  LLMRequest,
  LLMResponse,
} from './types';
import {
  toOpenAICompatibleMessages,
  toOpenAICompatibleTools,
  fromOpenAICompatibleResponse,
} from './openai-compatible';

const DEFAULT_AZURE_API_VERSION = '2024-02-15-preview';

export class AzureOpenAIProvider implements LLMProvider {
  readonly type = 'azure' as const;
  private apiKey: string;
  private endpoint: string;
  private deployment: string;
  private apiVersion: string;

  constructor(config: LLMProviderConfig) {
    const apiKey = config.azureApiKey?.trim();
    const endpoint = config.azureEndpoint?.trim();
    const deployment = config.azureDeployment?.trim();

    if (!apiKey) {
      throw new Error('Azure OpenAI API key is required. Configure it in Settings.');
    }
    if (!endpoint) {
      throw new Error('Azure OpenAI endpoint is required. Configure it in Settings.');
    }
    if (!deployment) {
      throw new Error('Azure OpenAI deployment name is required. Configure it in Settings.');
    }

    this.apiKey = apiKey;
    this.endpoint = endpoint.replace(/\/+$/, '');
    this.deployment = deployment;
    this.apiVersion = config.azureApiVersion?.trim() || DEFAULT_AZURE_API_VERSION;
  }

  private getRequestUrl(): string {
    const deployment = encodeURIComponent(this.deployment);
    const apiVersion = encodeURIComponent(this.apiVersion);
    return `${this.endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  }

  private isMaxTokensUnsupported(errorData: any): boolean {
    const message = errorData?.error?.message || '';
    return /max_tokens/i.test(message) && /max_completion_tokens/i.test(message);
  }

  private buildRequestBody(request: LLMRequest, useMaxCompletionTokens: boolean): Record<string, any> {
    const messages = toOpenAICompatibleMessages(request.messages, request.system);
    const tools = request.tools ? toOpenAICompatibleTools(request.tools) : undefined;
    const tokenField = useMaxCompletionTokens ? 'max_completion_tokens' : 'max_tokens';

    return {
      model: request.model || this.deployment,
      messages,
      [tokenField]: request.maxTokens,
      ...(tools && tools.length > 0 && { tools, tool_choice: 'auto' }),
    };
  }

  private async sendRequest(body: Record<string, any>, signal?: AbortSignal): Promise<Response> {
    return fetch(this.getRequestUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: JSON.stringify(body),
      signal,
    });
  }

  async createMessage(request: LLMRequest): Promise<LLMResponse> {
    try {
      let response = await this.sendRequest(this.buildRequestBody(request, false), request.signal);
      if (!response.ok) {
        let errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
        if (this.isMaxTokensUnsupported(errorData)) {
          response = await this.sendRequest(this.buildRequestBody(request, true), request.signal);
          if (response.ok) {
            const data = await response.json() as any;
            return fromOpenAICompatibleResponse(data);
          }
          errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
        }
        throw new Error(
          `Azure OpenAI API error: ${response.status} ${response.statusText}` +
          (errorData.error?.message ? ` - ${errorData.error.message}` : '')
        );
      }

      const data = await response.json() as any;
      return fromOpenAICompatibleResponse(data);
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        console.log('[Azure OpenAI] Request aborted');
        throw new Error('Request cancelled');
      }

      console.error('[Azure OpenAI] API error:', {
        message: error.message,
      });
      throw error;
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      let response = await this.sendRequest({
        model: this.deployment,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      });

      if (!response.ok) {
        let errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
        if (this.isMaxTokensUnsupported(errorData)) {
          response = await this.sendRequest({
            model: this.deployment,
            messages: [{ role: 'user', content: 'Hi' }],
            max_completion_tokens: 10,
          });
          if (response.ok) {
            return { success: true };
          }
          errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
        }
        return {
          success: false,
          error: errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to connect to Azure OpenAI',
      };
    }
  }
}

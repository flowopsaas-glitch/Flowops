// src/ai/plugins/plugin.interface.ts
export interface AiPluginContext {
  companyId: number;
  userId: string;
  requestId: string;
  telemetry?: {
    startTime: number;
    tokensUsed?: number;
    model?: string;
  };
}

export interface AiPluginResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    model: string;
    tokensUsed: number;
    latencyMs: number;
  };
}

export interface AiPlugin {
  /**
   * Unique identifier for this plugin
   */
  name: string;

  /**
   * Execute the plugin's AI logic
   */
  execute(
    input: { messages: Array<{ role: string; content: string }> },
    context: AiPluginContext
  ): Promise<AiPluginResult>;

  /**
   * Validate that output matches expected schema
   */
  validateOutput(output: any): boolean;

  /**
   * Get plugin metadata for observability
   */
  getMetadata(): {
    version: string;
    provider: string;
    models: string[];
    capabilities: string[];
  };
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export interface TokenUsage {
  total: number;
  prompt?: number;
  output?: number;
}

export interface AgentRunEntry {
  totalTokens: number;
  promptTokens?: number;
  outputTokens?: number;
  providerId: string;
  modelId: string;
}

export interface EvalRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  toolCalls: ToolCall[];
  tokens: TokenUsage;
  workDir: string;
}

export type CheckKind = 'assertion' | 'stat' | 'warning';

export interface CheckResult {
  name: string;
  kind: CheckKind;
  // assertions
  pass?: boolean;
  message?: string;
  // stats
  value?: string | number;
  note?: string;
}

export interface EvalReport {
  scenarioId: string;
  checks: CheckResult[];
}

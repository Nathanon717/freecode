export interface FileExpectation {
  path: string;
  contentExact?: string;
}

export interface ToolTraceExpectation {
  maxCalls?: number;
  sequence?: string[];
  present?: string[];
  absent?: string[];
}

export interface FakeLlmUsageExpectation {
  totalTokens?: number;
  promptTokens?: number;
  outputTokens?: number;
}

export interface FakeLlmTraceCallExpectation {
  provider?: string;
  model?: string;
  executionPath?: string;
  inputMessageCount?: number;
  lastUserContains?: string[];
  toolsAvailable?: string[];
  toolsAbsent?: string[];
  toolRationale?: boolean;
  parallelTools?: boolean;
  nativeToolsSupplied?: boolean;
  emittedTextContains?: string[];
  emittedToolCalls?: string[];
  usage?: FakeLlmUsageExpectation;
}

export interface FakeLlmTraceExpectation {
  callCount?: number;
  maxCalls?: number;
  calls?: FakeLlmTraceCallExpectation[];
}

export interface ScenarioExpectations {
  stdoutContains?: string[];
  stdoutAbsent?: string[];
  exitCode?: number;
  files?: FileExpectation[];
  toolTrace?: ToolTraceExpectation;
  fakeLlmTrace?: FakeLlmTraceExpectation;
}

export interface ToolTraceEvent {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export interface FakeLlmTraceEvent {
  callIndex: number;
  providerId: string;
  modelId: string;
  executionPath?: string;
  inputMessageCount: number;
  lastUserMessage: string;
  toolNames: string[];
  toolRationale?: boolean;
  parallelTools?: boolean;
  nativeToolsSupplied?: boolean;
  responseStep: number;
  emittedChunks: string[];
  emittedToolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  usage: {
    totalTokens: number;
    promptTokens?: number;
    outputTokens?: number;
  };
}


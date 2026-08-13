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

export interface E2eExpectations {
  stdoutContains?: string[];
  stdoutAbsent?: string[];
  /**
   * Substrings that must appear in this left-to-right order in the output.
   * Each must be present, and each must occur after the previous one — use it
   * to pin transcript ordering (e.g. a preamble before the tool call it precedes).
   */
  stdoutOrder?: string[];
  /**
   * An exact run of consecutive stdout lines — the non-TTY twin of the TTY
   * `screenBlock`, same matcher and same tokens (`*`, `...`, `re:`), blank lines
   * significant. Use it where blank-line placement or indentation is the
   * contract; substring assertions cannot see either.
   *
   * Needs no `env`: transcript output goes to stdout by default. A scenario that
   * silences it (`FREECODE_TRANSCRIPT_STREAM: "null"`) fails with that explanation
   * rather than silently matching nothing.
   */
  stdoutBlock?: string[];
  exitCode?: number;
  files?: FileExpectation[];
  toolTrace?: ToolTraceExpectation;
  fakeLlmTrace?: FakeLlmTraceExpectation;
  /** At least one shadow repo under this scenario's FREECODE_HOME contains a freecode snapshot commit. */
  snapshotCommit?: boolean;
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

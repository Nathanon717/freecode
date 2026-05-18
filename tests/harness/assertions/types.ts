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

export interface ScenarioExpectations {
  stdoutContains?: string[];
  stdoutAbsent?: string[];
  exitCode?: number;
  files?: FileExpectation[];
  toolTrace?: ToolTraceExpectation;
}

export interface ToolTraceEvent {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
}


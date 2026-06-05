export interface ScenarioClassificationInput {
  name?: string;
  requiresLlm?: unknown;
  model?: unknown;
  llmFixture?: unknown;
  turns?: Array<{ input?: unknown }>;
}

export interface ScenarioClassification {
  declaredRequiresLlm: boolean;
  inferredRequiresLlm: boolean;
  agentInputs: string[];
  errors: string[];
}

const NON_LLM_SCRIPT_COMMANDS = new Set([
  '/help',
  '/test',
  '/eval',
  '/keys',
  '/resume',
  '/clear',
  '/config',
  '/sources',
  '/model-sources',
]);

export function isScriptedConfirmation(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes' || normalized === 'n' || normalized === 'no';
}

export function isNonLlmScriptInput(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return true;
  if (isScriptedConfirmation(normalized)) return true;
  if (
    normalized === '/model' ||
    normalized.startsWith('/model ') ||
    normalized === '/models' ||
    normalized.startsWith('/models ')
  ) return true;
  return NON_LLM_SCRIPT_COMMANDS.has(normalized);
}

export function classifyScenario(scenario: ScenarioClassificationInput): ScenarioClassification {
  const turns = Array.isArray(scenario.turns) ? scenario.turns : [];
  const agentInputs = turns
    .map(turn => (typeof turn.input === 'string' ? turn.input.trim() : ''))
    .filter(input => input.length > 0 && !isNonLlmScriptInput(input));

  const declaredRequiresLlm = scenario.requiresLlm === true;
  const inferredRequiresLlm = agentInputs.length > 0;
  const hasFakeFixture = typeof scenario.llmFixture === 'string' && scenario.llmFixture.trim().length > 0;
  const errors: string[] = [];

  if (typeof scenario.requiresLlm !== 'boolean') {
    errors.push('requiresLlm must be explicitly set to true or false');
  }

  if (scenario.llmFixture !== undefined && !hasFakeFixture) {
    errors.push('llmFixture must be a non-empty string when present');
  }

  if (hasFakeFixture) {
    if (scenario.requiresLlm !== false) {
      errors.push('scenarios with llmFixture must set requiresLlm=false because fake LLM fixtures are free verification');
    }
    if (typeof scenario.model !== 'string' || (!scenario.model.startsWith('mock:') && !scenario.model.startsWith('mock-native:'))) {
      errors.push('scenarios with llmFixture must use a mock model such as mock:gpt-freecode-test or mock-native:gpt-freecode-test');
    }
    if (!inferredRequiresLlm) {
      errors.push('scenarios with llmFixture must include a scripted turn that reaches the agent loop');
    }
  }

  if (typeof scenario.requiresLlm === 'boolean' && declaredRequiresLlm !== inferredRequiresLlm && !hasFakeFixture) {
    const name = scenario.name ?? '(unnamed scenario)';
    if (declaredRequiresLlm) {
      errors.push(`${name} is marked requiresLlm=true but has no scripted turn that reaches the agent loop`);
    } else {
      errors.push(`${name} is marked requiresLlm=false but includes agent prompt(s): ${agentInputs.map(input => JSON.stringify(input)).join(', ')}`);
    }
  }

  return {
    declaredRequiresLlm,
    inferredRequiresLlm,
    agentInputs,
    errors,
  };
}

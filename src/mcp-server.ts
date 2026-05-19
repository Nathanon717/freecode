import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CoreMessage } from 'ai';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { agentLoop } from './agent/loop.js';
import { createSession, saveMessage } from './db/client.js';

const PLAYGROUND_BASE = join(import.meta.dirname, '..', 'playground');

let currentProjectRoot = process.cwd();
let messages: CoreMessage[] = [];
let selectedModel = '';
let sessionId = createSession(currentProjectRoot).id;

const server = new Server(
  { name: 'freecode', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'freecode_chat',
      description:
        'Send a message to the freecode coding agent. The agent has tools to read/write files, run shell commands, grep, and list directories. Conversation history is preserved across calls.',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The coding task or question for the agent' },
        },
        required: ['message'],
      },
    },
    {
      name: 'freecode_new_project',
      description:
        'Create a new project folder inside playground/ and set it as the working directory for the freecode agent. Clears conversation history. Returns the path of the new folder.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Folder name to create under playground/. Defaults to a timestamp-based name.',
          },
        },
      },
    },
    {
      name: 'freecode_set_cwd',
      description:
        'Set the working directory for the freecode agent to an existing absolute path. Clears conversation history.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to set as the working directory' },
        },
        required: ['path'],
      },
    },
    {
      name: 'freecode_clear',
      description: 'Clear the freecode conversation history and start a fresh session (keeps current working directory).',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'freecode_set_model',
      description: 'Switch the model used by freecode (e.g. "groq:llama-3.3-70b-versatile").',
      inputSchema: {
        type: 'object',
        properties: {
          model: { type: 'string', description: 'Provider:model string' },
        },
        required: ['model'],
      },
    },
    {
      name: 'freecode_status',
      description: 'Show current freecode session status: model, working directory, message count, session ID.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'freecode_new_project') {
    const folderName = (args as { name?: string }).name ?? `project-${Date.now()}`;
    const newPath = join(PLAYGROUND_BASE, folderName);
    await mkdir(newPath, { recursive: true });
    currentProjectRoot = newPath;
    messages = [];
    sessionId = createSession(currentProjectRoot).id;
    return {
      content: [{ type: 'text', text: `Created and switched to: ${newPath}\nSession cleared.` }],
    };
  }

  if (name === 'freecode_set_cwd') {
    currentProjectRoot = (args as { path: string }).path;
    messages = [];
    sessionId = createSession(currentProjectRoot).id;
    return {
      content: [{ type: 'text', text: `Working directory set to: ${currentProjectRoot}\nSession cleared.` }],
    };
  }

  if (name === 'freecode_clear') {
    messages = [];
    sessionId = createSession(currentProjectRoot).id;
    return { content: [{ type: 'text', text: `Session cleared. New session: ${sessionId.slice(0, 8)}` }] };
  }

  if (name === 'freecode_set_model') {
    selectedModel = (args as { model: string }).model;
    return { content: [{ type: 'text', text: `Model set to: ${selectedModel}` }] };
  }

  if (name === 'freecode_status') {
    return {
      content: [{
        type: 'text',
        text: `Model: ${selectedModel}\nCWD: ${currentProjectRoot}\nSession: ${sessionId.slice(0, 8)}\nMessages in context: ${messages.length}`,
      }],
    };
  }

  if (name === 'freecode_chat') {
    const message = (args as { message: string }).message;
    messages.push({ role: 'user', content: message });

    // Suppress stdout during agentLoop — MCP uses stdout for JSON-RPC
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;

    let result: Awaited<ReturnType<typeof agentLoop>>;
    try {
      result = await agentLoop(messages, currentProjectRoot, selectedModel);
    } finally {
      process.stdout.write = originalWrite;
    }

    messages.push({ role: 'assistant', content: result.text });
    saveMessage(sessionId, 'user', message, null);
    saveMessage(sessionId, 'assistant', result.text, result.usage.totalTokens);

    const footer = `\n\n---\n*[${result.providerId}:${result.modelId} | ${result.usage.totalTokens} tokens | ${messages.length} msgs in context]*`;
    return { content: [{ type: 'text', text: result.text + footer }] };
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
});

const transport = new StdioServerTransport();
await server.connect(transport);

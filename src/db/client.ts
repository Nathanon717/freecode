import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { logError } from '../logger.js';

const CONFIG_DIR = process.env.FREECODE_HOME ?? join(homedir(), '.config', 'freecode');

mkdirSync(CONFIG_DIR, { recursive: true });

const SESSIONS_DB_PATH = join(CONFIG_DIR, 'sessions.json');

export interface Session {
  id: string;
  project_root: string;
  last_activity_at: string;
}

export interface SessionMessage {
  id: number;
  session_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  token_count: number | null;
  created_at: string;
}

interface SessionsData {
  sessions: Session[];
  messages: SessionMessage[];
}

function loadSessionsData(): SessionsData {
  try {
    if (!existsSync(SESSIONS_DB_PATH)) {
      return { sessions: [], messages: [] };
    }
    const content = readFileSync(SESSIONS_DB_PATH, 'utf-8');
    const parsed = JSON.parse(content) as SessionsData;
    return parsed;
  } catch (err) {
    logError('db', `Failed to load sessions DB from ${SESSIONS_DB_PATH}`, err);
    return { sessions: [], messages: [] };
  }
}

function saveSessionsData(d: SessionsData): void {
  try {
    writeFileSync(SESSIONS_DB_PATH, JSON.stringify(d, null, 2));
  } catch (err) {
    logError('db', `Failed to save sessions DB to ${SESSIONS_DB_PATH}`, err);
    console.error('Failed to save session data:', err);
  }
}

export function createSession(projectRoot: string): Session {
  const d = loadSessionsData();
  const now = new Date().toISOString();
  const session: Session = {
    id: crypto.randomUUID(),
    project_root: projectRoot,
    last_activity_at: now,
  };
  d.sessions.push(session);
  saveSessionsData(d);
  return session;
}

export function getLastSession(projectRoot: string): Session | undefined {
  const d = loadSessionsData();
  return d.sessions
    .filter(s => s.project_root === projectRoot)
    .sort((a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime())[0];
}

export function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant' | 'tool',
  content: string,
  tokenCount: number | null
): SessionMessage {
  const d = loadSessionsData();
  const now = new Date().toISOString();
  const nextId = d.messages.reduce((max, m) => (m.id > max ? m.id : max), 0) + 1;
  const message: SessionMessage = {
    id: nextId,
    session_id: sessionId,
    role,
    content,
    token_count: tokenCount,
    created_at: now,
  };
  d.messages.push(message);
  if (role === 'assistant') {
    const session = d.sessions.find(s => s.id === sessionId);
    if (session) {
      session.last_activity_at = now;
    }
  }
  saveSessionsData(d);
  return message;
}

export function getSessionMessages(sessionId: string): SessionMessage[] {
  const d = loadSessionsData();
  return d.messages
    .filter(m => m.session_id === sessionId)
    .sort((a, b) => a.id - b.id);
}

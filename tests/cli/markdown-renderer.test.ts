import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { renderMarkdown, createMarkdownStreamRenderer } from '../../src/cli/markdown-renderer.js';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

// Force TTY so the renderer is active during tests.
let origIsTTY: boolean | undefined;
beforeEach(() => {
  origIsTTY = process.stdout.isTTY;
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
});
afterEach(() => {
  Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, configurable: true });
});

describe('renderMarkdown', () => {
  it('passes through plain text unchanged', () => {
    expect(stripAnsi(renderMarkdown('hello world'))).toBe('hello world');
  });

  it('renders **bold** stripping delimiters', () => {
    expect(stripAnsi(renderMarkdown('this is **bold** text'))).toBe('this is bold text');
  });

  it('renders *italic* stripping delimiters', () => {
    expect(stripAnsi(renderMarkdown('this is *italic* text'))).toBe('this is italic text');
  });

  it('does not apply inline formatting inside inline `code` spans', () => {
    const raw = 'use `**not bold**` here';
    const out = renderMarkdown(raw);
    // Strip ANSI; the backtick span should survive literally
    expect(stripAnsi(out)).toBe(raw);
  });

  it('renders fenced code block with green background, consuming fence lines', () => {
    const input = 'before\n```\nx = 1\n```\nafter';
    const out = renderMarkdown(input);
    const plain = stripAnsi(out);
    expect(plain).toBe('before\nx = 1\nafter');
    // The code line should have a green background escape
    expect(out).toMatch(/x = 1/);
  });

  it('shows language heading for fenced block with language identifier', () => {
    const input = '```python\nx = 1\n```';
    const out = renderMarkdown(input);
    const plain = stripAnsi(out);
    // Heading line ' python ' + code line 'x = 1'
    expect(plain).toBe(' python \nx = 1');
  });

  it('does not apply bold/italic inside fenced code block', () => {
    const input = '```\n**not bold** and *not italic*\n```';
    const out = renderMarkdown(input);
    // Raw content preserved — strip ANSI to verify text is unchanged
    expect(stripAnsi(out)).toBe('**not bold** and *not italic*');
  });

  it('handles unclosed code block gracefully', () => {
    const input = '```\nincomplete';
    const out = renderMarkdown(input);
    expect(stripAnsi(out)).toBe('incomplete');
  });

  it('returns raw text unchanged when not a TTY', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    const input = '**bold** and ```code```';
    expect(renderMarkdown(input)).toBe(input);
  });
});

describe('createMarkdownStreamRenderer', () => {
  it('assembles chunks into lines before rendering', () => {
    const r = createMarkdownStreamRenderer();
    expect(r.push('hel')).toBe(''); // partial line — nothing emitted yet
    const out = r.push('lo\n');
    expect(stripAnsi(out)).toBe('hello\n');
  });

  it('correctly renders bold across chunk boundary', () => {
    const r = createMarkdownStreamRenderer();
    r.push('say **bo');
    const out = r.push('ld** now\n');
    expect(stripAnsi(out)).toBe('say bold now\n');
  });

  it('does not apply formatting inside fenced code block', () => {
    const r = createMarkdownStreamRenderer();
    expect(stripAnsi(r.push('```\n'))).toBe(''); // opening fence consumed
    const codeLine = r.push('**raw**\n');
    expect(stripAnsi(codeLine)).toBe('**raw**\n'); // content untouched
    expect(stripAnsi(r.push('```\n'))).toBe(''); // closing fence consumed
  });

  it('shows language heading line for named block', () => {
    const r = createMarkdownStreamRenderer();
    const heading = r.push('```typescript\n');
    expect(stripAnsi(heading)).toBe(' typescript \n');
  });

  it('flush returns partial final line', () => {
    const r = createMarkdownStreamRenderer();
    r.push('partial');
    expect(stripAnsi(r.flush())).toBe('partial');
    expect(r.flush()).toBe(''); // second flush is empty
  });

  it('is a pass-through when not a TTY', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    const r = createMarkdownStreamRenderer();
    expect(r.push('**bold**\n')).toBe('**bold**\n');
    expect(r.flush()).toBe('');
  });
});

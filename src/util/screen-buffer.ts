const MAX_LINES = 150;
const lineBuffer: string[] = [];
let installed = false;

function stripAnsi(str: string): string {
  return str.replace(/\x1b(?:\[[0-9;?]*[A-Za-z]|[^[])/g, '');
}

export function installScreenBuffer(): void {
  if (installed) return;
  installed = true;

  const original = process.stdout.write.bind(process.stdout);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  (process.stdout as any).write = function (chunk: string | Buffer, ...args: unknown[]): boolean {
    if (typeof chunk === 'string') {
      const clean = stripAnsi(chunk).replace(/\r/g, '');
      for (const line of clean.split('\n')) {
        const trimmed = line.trimEnd();
        if (trimmed && (lineBuffer.length === 0 || lineBuffer[lineBuffer.length - 1] !== trimmed)) {
          lineBuffer.push(trimmed);
          if (lineBuffer.length > MAX_LINES) lineBuffer.shift();
        }
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return (original as any)(chunk, ...args);
  };
}

export function getScreenBuffer(): string {
  return lineBuffer.join('\n');
}

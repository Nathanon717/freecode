export let projectRoot: string = process.cwd();

const readFiles = new Set<string>();

export function setProjectRoot(path: string): void {
  projectRoot = path;
  readFiles.clear();
}

export function markFileRead(path: string): void {
  readFiles.add(path);
}

export function hasFileBeenRead(path: string): boolean {
  return readFiles.has(path);
}

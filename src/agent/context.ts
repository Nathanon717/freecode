export let projectRoot: string = process.cwd();

export function setProjectRoot(path: string): void {
  projectRoot = path;
}

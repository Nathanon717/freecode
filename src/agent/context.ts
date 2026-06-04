import { realpath } from 'fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'path';

export let projectRoot: string = process.cwd();

const readFiles = new Set<string>();

export function setProjectRoot(path: string): void {
  projectRoot = resolve(path);
  readFiles.clear();
}

export function markFileRead(path: string): void {
  readFiles.add(path);
}

export function hasFileBeenRead(path: string): boolean {
  return readFiles.has(path);
}

export interface ResolvedProjectPath {
  fullPath: string;
  relativePath: string;
}

function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/');
}

function assertInsideProject(root: string, target: string, originalPath: string): void {
  const relativePath = relative(root, target);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Path escapes project root: ${originalPath}`);
  }
}

export function resolveProjectPath(path: string): ResolvedProjectPath {
  if (path.trim() === '') {
    throw new Error('Path must not be empty');
  }
  if (isAbsolute(path)) {
    throw new Error(`Path must be relative to the project root: ${path}`);
  }

  const root = resolve(projectRoot);
  const fullPath = resolve(root, path);
  const relativePath = relative(root, fullPath);
  if (relativePath === '') {
    return { fullPath, relativePath: '.' };
  }
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Path escapes project root: ${path}`);
  }
  return { fullPath, relativePath: toPosixPath(relativePath) };
}

export async function resolveExistingProjectPath(path: string): Promise<ResolvedProjectPath> {
  const resolved = resolveProjectPath(path);
  const root = await realpath(projectRoot);
  const fullPath = await realpath(resolved.fullPath);
  assertInsideProject(root, fullPath, path);
  return { ...resolved, fullPath };
}

export async function resolveWritableProjectPath(path: string): Promise<ResolvedProjectPath> {
  const resolved = resolveProjectPath(path);
  const root = await realpath(projectRoot);
  const parentPath = await realpath(dirname(resolved.fullPath));
  assertInsideProject(root, parentPath, path);
  return resolved;
}

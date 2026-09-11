/**
 * Injectable filesystem backend interface.
 * Commands and utils accept a FileSystemBackend and default to the real implementation.
 * Tests can pass a mock backend to simulate filesystem effects without touching disk.
 */
export interface FileSystemBackend {
  pathExists(path: string): Promise<boolean>;
  mkdirp(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  copyFile(source: string, dest: string): Promise<void>;
  writeFile(path: string, contents: string): Promise<void>;
  listDirectories(path: string): Promise<string[]>;
}

import { fsExists, fsMkdirp, fsRemove, fsCopyFile, fsWriteFile, fsListDirectories } from "./fs.ts";

/**
 * Real filesystem backend — delegates to the actual fs utilities.
 * This is the default used by all commands in production.
 */
export const realFileSystemBackend: FileSystemBackend = {
  pathExists: fsExists,
  mkdirp: fsMkdirp,
  remove: fsRemove,
  copyFile: fsCopyFile,
  writeFile: fsWriteFile,
  listDirectories: fsListDirectories,
};

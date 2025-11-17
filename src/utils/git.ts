import { exec } from "child_process";
import { promisify } from "util";
import { DiffResult } from "../types";

const execAsync = promisify(exec);

export async function getDiff(repoPath: string): Promise<DiffResult> {
  try {
    const [diffResult, statsResult] = await Promise.all([
      execAsync("git diff --cached --unified=1", {
        cwd: repoPath,
        maxBuffer: 10 * 1024 * 1024,
      }),
      execAsync("git diff --cached --stat", {
        cwd: repoPath,
      }),
    ]);

    return { diff: diffResult.stdout || "", stats: statsResult.stdout || "" };
  } catch {
    // If no staged changes, try unstaged
    try {
      const [diffResult, statsResult] = await Promise.all([
        execAsync("git diff --unified=1", {
          cwd: repoPath,
          maxBuffer: 10 * 1024 * 1024,
        }),
        execAsync("git diff --stat", {
          cwd: repoPath,
        }),
      ]);

      return {
        diff: diffResult.stdout || "",
        stats: statsResult.stdout || "",
      };
    } catch (err) {
      const error = err as Error;
      throw new Error(`Failed to get git diff: ${error.message}`);
    }
  }
}

// Owner: Yadnesh. Ghost Recording files in recordings/. Paths can never leave that folder.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { parseRecording, type GhostRecording } from "@haunt-kit/host-sdk";

export function safeRecordingPath(dir: string, file: string): string {
  const root = resolve(dir);
  const full = resolve(root, file);
  const rel = relative(root, full);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel) || !full.endsWith(".json")) {
    throw new Error(`Recording must be a .json file inside ${basename(root)}/`);
  }
  return full;
}

export async function loadRecording(dir: string, file: string): Promise<GhostRecording> {
  const text = await readFile(safeRecordingPath(dir, file), "utf8");
  return parseRecording(JSON.parse(text));
}

export function recordingFileName(label: string, os: string, when: Date): string {
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "recording";
  const stamp = when.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
  return `${slug}-${os}-${stamp}.json`;
}

export async function saveRecording(
  dir: string,
  recording: GhostRecording,
  when = new Date(),
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const name = recordingFileName(recording.meta.label, recording.meta.os, when);
  const full = safeRecordingPath(dir, name);
  parseRecording(recording); // never write an invalid file
  await writeFile(full, JSON.stringify(recording, null, 2) + "\n");
  return join(basename(resolve(dir)), name);
}

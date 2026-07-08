import { BoardListSchema, type Board } from '@/lib/boards/types';
import { readJsonCached, writeJsonFile } from '@/lib/store/json';
import { dataFile } from '@/lib/store/paths';

const CONTENT_FILE = dataFile('boards');

export async function readBoards(): Promise<Board[]> {
  return readJsonCached(CONTENT_FILE, (raw) => BoardListSchema.parse(raw));
}

export async function writeBoards(boards: Board[]): Promise<void> {
  await writeJsonFile(CONTENT_FILE, BoardListSchema.parse(boards));
}

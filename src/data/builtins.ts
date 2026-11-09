import { hasKanji, makeWordKey } from "../lib/kana";
import type { Pack, PackWord, SeedPackJson } from "./types";

function seedUrl(filename: string): string {
  return new URL(`data/${filename}`, document.baseURI).toString();
}

async function fetchSeed(filename: string): Promise<SeedPackJson> {
  let response: Response;
  try {
    response = await fetch(seedUrl(filename));
  } catch {
    throw new Error("内置词包资源加载失败，请检查网络后重试。");
  }
  if (!response.ok) {
    throw new Error(
      `内置词包资源加载失败（${filename}，HTTP ${response.status}）。`,
    );
  }
  return (await response.json()) as SeedPackJson;
}

export function seedJsonToPack(seed: SeedPackJson, now = Date.now()): Pack {
  const words: PackWord[] = [];
  const seen = new Set<string>();
  for (const row of seed.words) {
    const [word, reading, meaning, groupNumber, sourceGroup] = row;
    if (!word || !reading) continue;
    const key = makeWordKey(word, reading);
    if (seen.has(key)) continue;
    seen.add(key);
    words.push({
      key,
      word,
      reading,
      meaning,
      jlpt: seed.level,
      hasKanji: hasKanji(word),
      sourceGroup,
      groupNumber,
      addedAt: now,
    });
  }
  return {
    id: seed.id,
    name: seed.name,
    description: seed.description,
    kind: "builtin",
    builtinLevel: seed.level,
    source: seed.source,
    words,
    createdAt: now,
    updatedAt: now,
  };
}

export async function fetchBuiltinPacks(now = Date.now()): Promise<Pack[]> {
  const [n1, n2] = await Promise.all([
    fetchSeed("builtin-n1.json"),
    fetchSeed("builtin-n2.json"),
  ]);
  return [seedJsonToPack(n1, now), seedJsonToPack(n2, now)];
}

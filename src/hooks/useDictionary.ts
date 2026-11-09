import { useCallback, useEffect, useState } from "react";
import {
  clearDictionaryMemoryCache,
  loadDictionary,
  type DictionaryData,
} from "../data/dictionary";

export interface DictionaryState {
  dictionary: DictionaryData | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useDictionary(enabled = true): DictionaryState {
  const [dictionary, setDictionary] = useState<DictionaryData | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadDictionary()
      .then((data) => {
        if (!cancelled) {
          setDictionary(data);
          setLoading(false);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "词典加载失败。");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);

  const retry = useCallback(() => {
    clearDictionaryMemoryCache();
    setAttempt((value) => value + 1);
  }, []);

  return { dictionary, loading, error, retry };
}

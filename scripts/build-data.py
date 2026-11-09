"""Build the compact offline dictionary and built-in packs.

Inputs are local files under data/ (not shipped):
  - tomoshi-dict-open.db (JMdict-derived open data, CC BY-SA 4.0)
  - JLPT_N1_N2_词汇表.json (provided by the app owner)
Outputs live in public/data/ and are what the static app fetches.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "public" / "data"
KANJI_RE = re.compile(r"[\u3400-\u9fff\uf900-\ufaff]")

POS_ZH = {
    "noun (common) (futsuumeishi)": "名词",
    "transitive verb": "他动词",
    "noun or participle which takes the aux. verb suru": "サ变名词",
    "intransitive verb": "自动词",
    "nouns which may take the genitive case particle 'no'": "の名词",
    "adjectival nouns or quasi-adjectives (keiyodoshi)": "形容动词",
    "Ichidan verb": "一段动词",
    "adverb (fukushi)": "副词",
    "Godan verb with 'ru' ending": "五段动词",
    "Godan verb with 'su' ending": "五段动词",
    "adjective (keiyoushi)": "形容词",
    "expressions (phrases, clauses, etc.)": "惯用语",
    "noun, used as a suffix": "接尾名词",
    "Godan verb with 'mu' ending": "五段动词",
    "Godan verb with 'ku' ending": "五段动词",
    "adverb taking the 'to' particle": "と副词",
    "Godan verb with 'u' ending": "五段动词",
    "suffix": "后缀",
    "particle": "助词",
    "interjection (kandoushi)": "感叹词",
    "noun or verb acting prenominally": "连体词",
    "counter": "量词",
    "prefix": "前缀",
    "pronoun": "代词",
    "conjunction": "接续词",
    "Godan verb with 'tsu' ending": "五段动词",
    "suru verb - special class": "サ变动词",
    "Godan verb with 'gu' ending": "五段动词",
    "auxiliary verb": "助动词",
    "Godan verb with 'bu' ending": "五段动词",
    "noun, used as a prefix": "接头名词",
    "numeric": "数词",
    "'taru' adjective": "トタル形容词",
    "pre-noun adjectival (rentaishi)": "连体词",
    "suru verb - included": "スル动词",
}


def clean(text: str) -> str:
    return unicodedata.normalize("NFC", re.sub(r"\s+", " ", str(text or "")).strip())


def has_kanji(text: str) -> bool:
    return bool(KANJI_RE.search(text))


def compact_json(path: Path, obj: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(obj, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"wrote {path} ({path.stat().st_size:,} bytes)")


def build_dictionary(db_path: Path, out_path: Path) -> None:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        """
        select e.id, e.is_common, e.data, z.data as zh, f.rank, v.level
        from entries e
        left join zh_defs z on z.entry_id = e.id
        left join freq_rank f on f.entry_id = e.id
        left join vocab_jlpt v on v.entry_id = e.id
        where e.is_common = 1 or v.entry_id is not null
        order by coalesce(f.rank, 999999), e.id
        """
    ).fetchall()
    entries = []
    seen = set()
    for row in rows:
        if row["id"] in seen:
            continue
        seen.add(row["id"])
        entry = json.loads(row["data"])
        kanji = [
            clean(item.get("text", ""))
            for item in entry.get("kanji", [])
            if clean(item.get("text", ""))
        ]
        kana = [
            clean(item.get("text", ""))
            for item in entry.get("kana", [])
            if clean(item.get("text", ""))
        ]
        if not kanji and not kana:
            continue
        surface = kanji[0] if kanji else kana[0]
        reading = kana[0] if kana else surface
        alt_readings = []
        for value in kana[1:]:
            if value != reading and value not in alt_readings:
                alt_readings.append(value)
        variants = []
        for value in kanji[1:]:
            if value != surface and value not in variants:
                variants.append(value)

        meanings = []
        zh = json.loads(row["zh"]) if row["zh"] else {}
        senses = zh.get("senses", {}) if isinstance(zh, dict) else {}
        for _, sense in senses.items():
            glosses = [
                clean(item.get("text", ""))
                for item in sense.get("glosses", [])
                if clean(item.get("text", ""))
            ]
            if glosses:
                text = "；".join(dict.fromkeys(glosses))
                if text not in meanings:
                    meanings.append(text)
        if not meanings:
            continue

        pos = []
        for sense in entry.get("senses", []):
            for value in sense.get("pos", []):
                label = POS_ZH.get(value, value)
                if label not in pos:
                    pos.append(label)
        level = clean(row["level"] or entry.get("jlpt_level") or "")
        if level and not re.fullmatch(r"N[1-5]", level):
            level = ""
        # Compact row contract, shared with src/data/dictionary.ts.
        entries.append(
            [
                surface,
                reading,
                " ｜ ".join(meanings[:8]),
                level,
                int(row["rank"] or 0),
                " / ".join(pos[:5]),
                str(row["id"]),
                "、".join(alt_readings[:4]),
                "、".join(variants[:4]),
                1 if has_kanji(surface) else 0,
            ]
        )

    entries.sort(key=lambda item: (item[4] if item[4] else 999999, item[9] == 0, item[0]))
    payload = {
        "schema": 1,
        "version": "2026-11-06",
        "count": len(entries),
        "license": "CC BY-SA 4.0",
        "source": "JMdict / KANJIDIC2 (EDRDG) + Tomoshi open data (Y1Z)",
        "modified": (
            "Subset of common and JLPT entries; compacted fields; "
            "example sentences removed."
        ),
        "entries": entries,
    }
    compact_json(out_path, payload)
    print(
        f"dictionary entries: {len(entries):,}, "
        f"kanji entries: {sum(item[9] for item in entries):,}"
    )


def build_pack(src_path: Path, level: str, out_path: Path) -> None:
    raw = json.loads(src_path.read_text(encoding="utf-8"))
    words = []
    seen = set()
    source_index = {id(item): index for index, item in enumerate(raw)}
    items = [
        item
        for item in raw
        if clean(item.get("level")) == level and item.get("typing_units")
    ]

    def group_no(item: dict) -> int:
        units = item.get("typing_units") or []
        match = re.search(r"#(\d+)", str(units[0])) if units else None
        return int(match.group(1)) if match else 999

    items.sort(key=lambda item: (group_no(item), source_index[id(item)]))
    for item in items:
        word = clean(item.get("word"))
        reading = clean(item.get("reading"))
        meaning = clean(item.get("meaning"))
        if not word or not reading:
            continue
        key = (word, reading)
        if key in seen:
            continue
        seen.add(key)
        units = item.get("typing_units") or []
        words.append(
            [
                word,
                reading,
                meaning,
                group_no(item),
                clean(units[0]) if units else "",
            ]
        )

    payload = {
        "id": f"builtin-{level.lower()}",
        "name": f"{level} 高频词",
        "level": level,
        "description": (
            f"项目所有者提供的 {level} 高频学习词表，共 {len(words)} 词。"
            "任务以整包动态生成。"
        ),
        "source": "项目所有者提供的学习词表",
        "groupCount": len({word[3] for word in words}),
        "words": words,
    }
    compact_json(out_path, payload)
    print(f"{level}: {len(words)} words in {payload['groupCount']} groups")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--db", type=Path, default=DATA / "tomoshi-dict-open.db"
    )
    parser.add_argument(
        "--jlpt", type=Path, default=DATA / "JLPT_N1_N2_词汇表.json"
    )
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    build_dictionary(args.db, OUT / "dictionary.json")
    build_pack(args.jlpt, "N1", OUT / "builtin-n1.json")
    build_pack(args.jlpt, "N2", OUT / "builtin-n2.json")


if __name__ == "__main__":
    main()

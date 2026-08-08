import json
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

FEED_URL = "https://www.riken.jp/feed/press_feed/"
KEYWORDS = ("生化学", "生命", "遺伝子", "細胞", "タンパク", "DNA", "RNA", "がん", "免疫", "創薬", "医療", "薬", "感染", "iPS", "脳", "腸", "微生物", "再生", "ミトコンドリア", "代謝", "脂質", "酵素", "植物")

with urllib.request.urlopen(FEED_URL, timeout=30) as response:
    root = ET.fromstring(response.read())

articles = []
for item in root.findall("./channel/item"):
    title = (item.findtext("title") or "").strip()
    if not any(keyword in title for keyword in KEYWORDS):
        continue
    published = item.findtext("pubDate") or ""
    try:
        published = parsedate_to_datetime(published).date().isoformat()
    except (TypeError, ValueError):
        pass
    articles.append({
        "id": "riken-" + (item.findtext("guid") or item.findtext("link") or title),
        "category": "biochem",
        "title": title,
        "link": item.findtext("link") or "https://www.riken.jp/press/",
        "source": "理化学研究所",
        "date": published,
    })

if len(articles) < 4:
    raise RuntimeError("生命科学系の記事が4件見つかりませんでした")

with open("data/biochem.json", "w", encoding="utf-8") as output:
    json.dump({"articles": articles[:4]}, output, ensure_ascii=False, indent=2)
    output.write("\n")

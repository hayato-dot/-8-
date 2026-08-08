const FEEDS = {
  current: { url: 'https://www3.nhk.or.jp/rss/news/cat0.xml', source: 'NHK NEWS WEB', direct: true },
  biochem: { url: 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=(TITLE:biochemistry%20OR%20TITLE:biochemical%20OR%20TITLE:%22molecular%20biology%22)%20AND%20OPEN_ACCESS:Y&format=json&pageSize=8&sort_date:y', source: 'Europe PMC', type: 'json' }
};
const CACHE_MAX_AGE = 30 * 60 * 1000;
const NEWS_CACHE_KEY = 'morning-eight-news-ja-v2';
const TRANSLATION_CACHE_KEY = 'morning-eight-translations-v2';
const state = { articles: [], filter: 'all', saved: new Set(JSON.parse(localStorage.getItem('saved-articles') || '[]')) };
const feed = document.querySelector('#feed');
const statusLine = document.querySelector('#status');
const refreshButton = document.querySelector('#refresh');

document.querySelector('#today').textContent = new Intl.DateTimeFormat('ja-JP', { year:'numeric', month:'long', day:'numeric', weekday:'short' }).format(new Date());

function parseFeed(xmlText, category) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  return [...doc.querySelectorAll('item')].slice(0, 4).map((item, index) => ({
    id: `${category}-${item.querySelector('guid, link')?.textContent || index}`,
    category, title: item.querySelector('title')?.textContent?.replace(/\s+-\s+[^-]+$/, '') || '記事タイトル',
    link: (item.querySelector('link')?.textContent || '#').replace(/^http:/, 'https:'),
    source: item.querySelector('source')?.textContent || FEEDS[category].source,
    date: item.querySelector('pubDate')?.textContent || ''
  }));
}
async function getNews(category) {
  const feedInfo = FEEDS[category];
  const response = await fetch(feedInfo.url);
  if (!response.ok) throw new Error('ニュースを取得できませんでした');
  if (feedInfo.type === 'json') {
    const data = await response.json();
    return (data.resultList?.result || []).filter(article => article.isOpenAccess === 'Y').slice(0, 4).map((article, index) => {
      const originalUrl = `https://europepmc.org/article/${article.source}/${article.id}`;
      return {
        id: `biochem-${article.source}-${article.id || index}`,
        category: 'biochem',
        title: article.title || '生化学の新着研究',
        link: originalUrl,
        source: article.journalTitle || feedInfo.source,
        date: article.firstPublicationDate || ''
      };
    });
  }
  const articles = parseFeed(await response.text(), category);
  return articles;
}
function isJapanese(text) { return /[\u3040-\u30ff\u3400-\u9fff]/.test(text); }
function readTranslationCache() {
  try { return JSON.parse(localStorage.getItem(TRANSLATION_CACHE_KEY) || '{}'); } catch { return {}; }
}
async function translateTitle(title, translations) {
  if (isJapanese(title)) return title;
  if (translations[title]) return translations[title];
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(title)}&langpair=en|ja`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('翻訳を取得できませんでした');
  const data = await response.json();
  const translated = data.responseData?.translatedText;
  if (!translated || translated === title) throw new Error('翻訳結果がありません');
  translations[title] = translated;
  return translated;
}
async function translateArticles(articles) {
  const translations = readTranslationCache();
  const translated = await Promise.all(articles.map(async article => ({ ...article, title: await translateTitle(article.title, translations) })));
  localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(translations));
  return translated;
}
function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(NEWS_CACHE_KEY) || 'null');
    return cached && Date.now() - cached.savedAt < CACHE_MAX_AGE ? cached.articles : null;
  } catch { return null; }
}
function writeCache(articles) {
  localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ articles, savedAt: Date.now() }));
}
function fallbackArticles() {
  return [
    ['current','世界の重要ニュースを確認する','ニュースの読み込み後に最新記事が表示されます'], ['current','国内の動きを押さえる','ニュースの読み込み後に最新記事が表示されます'], ['current','経済・テクノロジーの話題','ニュースの読み込み後に最新記事が表示されます'], ['current','社会をめぐる最新トピック','ニュースの読み込み後に最新記事が表示されます'],
    ['biochem','生化学の最新研究','ニュースの読み込み後に最新記事が表示されます'], ['biochem','分子生物学の研究動向','ニュースの読み込み後に最新記事が表示されます'], ['biochem','医療・創薬のニュース','ニュースの読み込み後に最新記事が表示されます'], ['biochem','生命科学の注目トピック','ニュースの読み込み後に最新記事が表示されます']
  ].map(([category,title,source], i) => ({ id:`fallback-${i}`, category, title, source, link:'https://news.google.com/', date:'' }));
}
function render() {
  const articles = state.articles.filter(a => state.filter === 'all' || a.category === state.filter || (state.filter === 'saved' && state.saved.has(a.id)));
  feed.replaceChildren();
  if (!articles.length) { feed.innerHTML = '<p class="empty">保存した記事はまだありません。</p>'; return; }
  const template = document.querySelector('#article-template');
  articles.forEach(article => {
    const node = template.content.cloneNode(true);
    const category = node.querySelector('.category');
    category.textContent = article.category === 'current' ? '時事' : '生化学';
    category.classList.toggle('biochem', article.category === 'biochem');
    node.querySelector('time').textContent = article.date ? new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric'}).format(new Date(article.date)) : '';
    node.querySelector('h2').textContent = article.title;
    node.querySelector('.source').textContent = article.source;
    const link = node.querySelector('.read-link'); link.href = article.link;
    const save = node.querySelector('.save-button');
    const isSaved = state.saved.has(article.id); save.classList.toggle('is-saved', isSaved); save.textContent = isSaved ? '♥' : '♡';
    save.addEventListener('click', () => { state.saved.has(article.id) ? state.saved.delete(article.id) : state.saved.add(article.id); localStorage.setItem('saved-articles', JSON.stringify([...state.saved])); render(); });
    feed.append(node);
  });
}
async function load(force = false) {
  const cached = force ? null : readCache();
  refreshButton.disabled = true; statusLine.classList.remove('error');
  if (cached) { state.articles = cached; statusLine.textContent = '保存済みの記事を表示中…'; render(); }
  else { statusLine.textContent = '最新の記事を集めています…'; }
  try {
    const [current, biochem] = await Promise.all([getNews('current'), getNews('biochem')]);
    statusLine.textContent = '生化学ニュースを日本語に訳しています…';
    state.articles = [...current, ...(await translateArticles(biochem))];
    writeCache(state.articles); statusLine.textContent = '更新済み — 各カテゴリ4本';
  }
  catch { state.articles = fallbackArticles(); statusLine.textContent = '通信できないため、再読み込みで最新記事を取得してください。'; statusLine.classList.add('error'); }
  refreshButton.disabled = false; render();
}
document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => { document.querySelector('.tab.is-active').classList.remove('is-active'); button.classList.add('is-active'); state.filter = button.dataset.filter; render(); }));
refreshButton.addEventListener('click', () => load(true));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
load();

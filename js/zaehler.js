// Zählt Seitenaufrufe ohne Cookies. Gemeldet werden nur die Seite und eine grobe Herkunftsart (etwa „google“ oder „intern“),
// keine Kennung, nichts wird im Browser gespeichert. Der Server führt nur Tagessummen (Tabelle auswertung.web_aufrufe,
// Funktion web_aufruf, siehe ersatzteilgarage/supabase/web-aufrufe.sql), die Werkbank zeigt sie unter Statistik.
// Wer „Do Not Track“ oder „Global Privacy Control“ eingeschaltet hat, wird nicht gezählt, Suchmaschinen-Bots auch nicht.
(() => {
  'use strict';
  if (!/^(www\.)?radgarage\.app$/.test(location.hostname)) return;
  if (navigator.globalPrivacyControl || navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
  if (navigator.webdriver || /bot|crawl|spider|slurp|headless|lighthouse|preview/i.test(navigator.userAgent)) return;
  const SERVER = { url: 'https://axiirnfgtbmmjlfwlyfe.supabase.co', key: 'sb_publishable_dBz5uK-7wYwKKL3O8Qd0MA_pYzxTP_2' };
  // Reihenfolge zählt: KI-Dienste vor Google (gemini.google.com), eigene Seite zuerst
  const ARTEN = [
    ['intern', /(^|\.)radgarage\.app$/],
    ['ki', /(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|you\.com|phind\.com)$/],
    ['google', /(^|\.)google\.[a-z.]+$/],
    ['bing', /(^|\.)bing\.com$/],
    ['andere-suche', /(^|\.)(duckduckgo\.com|ecosia\.org|startpage\.com|qwant\.com|search\.brave\.com|yahoo\.com|yandex\.[a-z]+|metager\.de|web\.de|gmx\.net|t-online\.de)$/],
    ['sozial', /(^|\.)(facebook\.com|instagram\.com|t\.co|x\.com|twitter\.com|reddit\.com|linkedin\.com|youtube\.com|pinterest\.[a-z.]+|whatsapp\.com|threads\.net|bsky\.app|strava\.com|lnkd\.in)$/],
  ];
  let quelle = 'direkt';
  let oben = true;
  try { oben = window.top === window.self; } catch (e) { oben = false; }
  if (!oben) {
    quelle = 'eingebettet';
  } else if (document.referrer) {
    try {
      const host = new URL(document.referrer).hostname;
      quelle = (ARTEN.find(([, muster]) => muster.test(host)) || ['andere'])[0];
    } catch (e) {
      quelle = 'andere';
    }
  }
  const pfad = (document.documentElement.dataset.zaehlpfad || location.pathname).replace(/index\.html$/, '').toLowerCase();
  const senden = () => fetch(`${SERVER.url}/rest/v1/rpc/web_aufruf`, {
    method: 'POST',
    keepalive: true,
    headers: { apikey: SERVER.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_pfad: pfad.slice(0, 120), p_quelle: quelle }),
  }).catch(() => {});
  // Vorab geladene Seiten erst zählen, wenn sie wirklich angezeigt werden
  if (document.prerendering) document.addEventListener('prerenderingchange', senden, { once: true });
  else senden();
})();

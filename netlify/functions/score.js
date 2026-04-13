// netlify/functions/score.js
// Motore predittivo score vendita

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const W = {
  brand:    { 3: 20, 2: 12, 1: 4 },
  decade:   { y2k: 14, '90s': 18, '80s': 8, '70s': 6, recent: 3 },
  cond:     { 1: 16, 2: 11, 3: 5, 4: 0 },
  size:     { core: 14, xl: 10, small: 8, extreme: 3, onesize: 11 },
  season:   { match: 10, soon: 5, mismatch: 0 },
  price:    { below: 10, inline: 6, above: 0 },
  digital:  { 2: 8, 1: 3, 0: 0 },
  cannibal: { 0: 0, 1: -5, 2: -12 },
};
const CAT_BOOST = { U: 0, D: 2, A: 4, S: -1, O: -3 };
const MAX_RAW = 20 + 18 + 16 + 14 + 10 + 10 + 8 + 4;
const MARKUP = { U: 2.4, D: 2.5, A: 2.8, S: 2.2, O: 2.3 };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const v = JSON.parse(event.body);

    // Determina price factor rispetto al mercato
    let priceFactor = 'inline';
    if (v.marketPrice && v.cost) {
      const suggested = v.cost * (MARKUP[v.cat] || 2.4);
      if (suggested < v.marketPrice * 0.8) priceFactor = 'below';
      else if (suggested > v.marketPrice * 1.2) priceFactor = 'above';
    }

    const raw =
      (W.brand[v.brandTier] || 0) +
      (W.decade[v.decade] || 0) +
      (W.cond[v.cond] || 0) +
      (W.size[v.size] || 0) +
      (W.season[v.season] || 0) +
      (W.price[priceFactor] || 0) +
      (W.digital[v.digital] || 0) +
      (W.cannibal[v.cannibal] || 0) +
      (CAT_BOOST[v.cat] || 0);

    const score = Math.min(98, Math.max(5, Math.round((raw / MAX_RAW) * 100)));

    // Stima giorni alla vendita
    const decay = score >= 70 ? 0.018 : score >= 45 ? 0.012 : 0.007;
    const daysInShop = v.daysInShop || 0;
    const decayed = Math.max(2, Math.round(score * Math.exp(-decay * daysInShop)));
    const avgDays = Math.round(30 * (1 - decayed / 100) * 2.5 + 5);

    const tier = score >= 70 ? 'hot' : score >= 45 ? 'good' : score >= 25 ? 'med' : 'slow';

    // Insights specifici
    const insights = [];
    if (v.season === 'mismatch') insights.push({ type: 'neg', text: 'Fuori stagione: considera di mettere in storage e rimettere in esposizione il mese prima.' });
    if (v.digital === 0 || v.digital === 1) insights.push({ type: 'neu', text: 'Online con foto curate pu\u00f2 aumentare la probabilit\u00e0 del 15-20%.' });
    if (v.cannibal === 2) insights.push({ type: 'neg', text: '3+ pezzi simili in stock: rischio cannibalizzazione interna.' });
    if (v.brandTier === 3 && v.decade === '90s') insights.push({ type: 'pos', text: "Brand alto + anni '90: combinazione ideale per il mercato napoletano." });
    if (v.size === 'extreme') insights.push({ type: 'neg', text: 'Taglia estrema: usa Vinted/Depop come canale primario.' });
    if (daysInShop > 45) insights.push({ type: 'neg', text: 'Oltre 45 giorni: valuta uno sconto del 20-30% o cambio posizione in negozio.' });

    // Prezzo suggerito
    const byMarkup = (v.cost || 0) * (MARKUP[v.cat] || 2.4);
    const marketRef = v.marketPrice || 0;
    const suggested = Math.round(Math.max(byMarkup, marketRef > 0 ? marketRef * 0.9 : byMarkup) / 0.5) * 0.5;

    // Breakdown fattori
    const factors = [
      { name: 'Brand recognition', score: Math.round(((W.brand[v.brandTier] || 0) / 20) * 100), max: 20 },
      { name: 'Decade / trend', score: Math.round(((W.decade[v.decade] || 0) / 18) * 100), max: 18 },
      { name: 'Condizione', score: Math.round(((W.cond[v.cond] || 0) / 16) * 100), max: 16 },
      { name: 'Taglia', score: Math.round(((W.size[v.size] || 0) / 14) * 100), max: 14 },
      { name: 'Stagionalit\u00e0', score: Math.round(((W.season[v.season] || 0) / 10) * 100), max: 10 },
      { name: 'Prezzo vs mercato', score: Math.round(((W.price[priceFactor] || 0) / 10) * 100), max: 10 },
      { name: 'Visibilit\u00e0 digitale', score: Math.round(((W.digital[v.digital] || 0) / 8) * 100), max: 8 },
    ];

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, decayed, tier, avgDays, insights, factors, suggested, priceFactor }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};

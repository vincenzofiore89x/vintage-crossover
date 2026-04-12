// netlify/functions/prices.js
// Ricerca prezzi live su Vinted, Depop, Vestiaire via Claude API + web_search

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: 'Method not allowed' };
  }

  try {
    const { brand, desc, cat, decade, cond, cost } = JSON.parse(event.body);
    const prompt = `Cerca i prezzi attuali di mercato per: "${brand || ''} ${desc || ''}"\nCategoria: ${cat}\nDecade: ${decade}\nCondizione: ${cond}\nMercato: Italia, Campania/Napoli\nPiattaforme: Vinted, Depop, Vestiaire Collective\n\nRestituisci SOLO JSON: {"min":N," max":N,"avg":N,"sources":[{"platform":"string","price":N,"condition":"string","url":""}],"summary":"string","confidence":"alta|media|bassa"}`;

    const res1 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, tools: [{ type: 'web_search_20250305', name: 'web_search' }], system: 'Sei un esperto di mercato vintage italiano. Usa web_search per trovare prezzi reali. Rispondi SOLO con JSON valido.', messages: [{ role: 'user', content: prompt }] }),
    });
    const data1 = await res1.json();
    if (!res1.ok) throw new Error(data1.error?.message || 'Claude API error');

    let finalText = '';
    if (data1.stop_reason === 'tool_use') {
      const toolUseBlock = data1.content.find(b => b.type === 'tool_use');
      const res2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 800, tools: [{ type: 'web_search_20250305', name: 'web_search' }], system: 'Rispondi SOLO con JSON valido.', messages: [{ role: 'user', content: prompt }, { role: 'assistant', content: data1.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseBlock?.id, content: '{}' }] }] }),
      });
      const data2 = await res2.json();
      finalText = data2.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
    } else {
      finalText = data1.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
    }

    let parsed;
    try {
      const clean = finalText.replace(/```json|```/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : clean);
    } catch (e) {
      const fallbacks = { 'abbigliamento uomo': 35, 'abbigliamento donna': 30, 'accessori': 40, 'scarpe': 45, 'giacca cappotto': 65 };
      const base = fallbacks[cat] || 35;
      parsed = { min: Math.round(base * 0.7), max: Math.round(base * 1.4), avg: base, sources: [], summary: 'Stima basata su dati categoria', confidence: 'bassa' };
    }
    return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(parsed) };
  } catch (err) {
    console.error('prices error:', err);
    return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
  }
};

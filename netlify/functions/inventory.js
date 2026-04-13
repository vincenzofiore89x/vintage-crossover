// netlify/functions/inventory.js
// CRUD completo per l'inventario su Airtable

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME || 'Inventario';
const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE)}`;

const headers = {
  'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  const method = event.httpMethod;
  const params = event.queryStringParameters || {};

  try {
    if (method === 'GET') {
      let url = BASE_URL + '?pageSize=100&sort[0][field]=Data&sort[0][direction]=desc';
      if (params.filterByFormula) url += `&filterByFormula=${encodeURIComponent(params.filterByFormula)}`;
      if (params.offset) url += `&offset=${params.offset}`;
      const res = await fetch(url, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Airtable error');
      const items = data.records.map(r => ({ id: r.id, ...r.fields }));
      return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ items, offset: data.offset || null }) };
    }
    if (method === 'POST') {
      const body = JSON.parse(event.body);
      const res = await fetch(BASE_URL, { method: 'POST', headers, body: JSON.stringify({ records: [{ fields: sanitizeFields(body) }] }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Airtable error');
      return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.records[0].id, ...data.records[0].fields }) };
    }
    if (method === 'PATCH') {
      const body = JSON.parse(event.body);
      const { id, ...fields } = body;
      if (!id) throw new Error('ID mancante');
      const res = await fetch(`${BASE_URL}/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ typecast: true, fields: sanitizeFields(fields) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Airtable error');
      return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.id, ...data.fields }) };
    }
    if (method === 'DELETE') {
      const id = params.id;
      if (!id) throw new Error('ID mancante');
      const res = await fetch(`${BASE_URL}/${id}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Airtable error');
      return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ deleted: true, id }) };
    }
    return { statusCode: 405, headers: cors, body: 'Method not allowed' };
  } catch (err) {
    console.error('inventory error:', err);
    return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
  }
};

function sanitizeFields(f) {
  const map = { cat: 'Categoria', brand: 'Brand', desc: 'Descrizione', size: 'Taglia', cond: 'Condizione', decade: 'Decade', brandTier: 'Brand Tier', season: 'Stagione', digital: 'VisibilitÃ  Digitale', cannibal: 'Cannibalizzazione', cost: 'Costo Acquisto', price: 'Prezzo Vendita', marketPrice: 'Prezzo Mercato Live', marketText: 'Note Mercato', score: 'Score Predittivo', year: 'Anno Periodo', notes: 'Note', status: 'Status' };
  const out = {};
  for (const [k, v] of Object.entries(f)) { if (map[k] && v !== undefined && v !== null && v !== '') out[map[k]] = v; }
  if (!f.id) out['Data'] = new Date().toISOString().split('T')[0];
  return out;
}

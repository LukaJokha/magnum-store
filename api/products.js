const { readFile } = require('node:fs/promises');
const { join } = require('node:path');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(501).json({ error: 'Product editing is available in the desktop administration app.' });
  try {
    const catalog = JSON.parse(await readFile(join(process.cwd(), 'data', 'products.json'), 'utf8'));
    return res.status(200).json(catalog);
  } catch {
    return res.status(500).json({ error: 'The product catalog could not be loaded.' });
  }
};

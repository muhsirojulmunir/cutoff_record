const fs = require('fs');
const XLSX = require('xlsx');

function parseExcelDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    // Excel base date Dec 30 1899
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  return null;
}

function parseMoney(val) {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (typeof val === 'string') {
    // Remove "IDR", "Rp", commas, whitespace
    const clean = val.replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
  }
  return null;
}

function parseIntSafe(val, def = null) {
  if (val === undefined || val === null || val === '') return def;
  const num = parseInt(val, 10);
  return isNaN(num) ? def : num;
}

function cleanStr(val, maxLen = 255) {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === '' || s === 'null') return null;
  return s.substring(0, maxLen);
}

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  return "'" + String(val).replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, (char) => {
    switch (char) {
      case "\0": return "\\0";
      case "\x08": return "\\b";
      case "\x09": return "\\t";
      case "\x1a": return "\\z";
      case "\n": return "\\n";
      case "\r": return "\\r";
      case "\"":
      case "'":
      case "\\":
      case "%":
        return "\\" + char;
      default:
        return char;
    }
  }) + "'";
}

console.log('Reading CUT OFF 2026.xlsx...');
const wb = XLSX.readFile('CUT OFF 2026.xlsx');
const sheet = wb.Sheets['CUT OFF 2026'];
if (!sheet) {
  console.error('Sheet CUT OFF 2026 not found!');
  process.exit(1);
}

const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
console.log(`Total raw rows in sheet: ${rawRows.length}`);

// Header is row 0
const rows = rawRows.slice(1);
const records = [];

for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r.length === 0) continue;

  const orderNumber = cleanStr(r[5], 100);
  const channel = cleanStr(r[4], 50) || 'OTHER';
  
  // Skip completely empty rows that don't have order number or channel
  if (!orderNumber && !cleanStr(r[6], 100) && !cleanStr(r[12], 150)) continue;

  records.push({
    info_gudang: cleanStr(r[0], 100),
    keterangan_solutif: cleanStr(r[1], 1000),
    order_date: parseExcelDate(r[2]),
    row_no: cleanStr(r[3], 50),
    channel: channel,
    order_number: orderNumber || `NO-ORD-${i + 1}`,
    jl_number: cleanStr(r[6], 100),
    order_status: cleanStr(r[7], 100),
    sheet_dpp: cleanStr(r[8], 100),
    marketplace_net_payout: parseMoney(r[9]),
    dpp_number: cleanStr(r[10], 100),
    product_name: cleanStr(r[11], 255),
    sku_utama: cleanStr(r[12], 150),
    sku_pengganti: cleanStr(r[13], 150),
    qty: parseIntSafe(r[14], 1),
    recheck_qty: parseIntSafe(r[15], null),
    package_count: cleanStr(r[16], 50),
    buyer_username: cleanStr(r[17], 150),
    est_net_income: parseMoney(r[18]),
    shipping_courier: cleanStr(r[19], 150),
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  });
}

console.log(`Valid records parsed: ${records.length}`);

// Generate SQL dump in chunks
const BATCH_SIZE = 500;
const sqlFile = 'scratch/import_cutoff.sql';
if (!fs.existsSync('scratch')) fs.mkdirSync('scratch', { recursive: true });

let sqlContent = 'TRUNCATE TABLE cut_off_orders;\n';
const cols = [
  'info_gudang', 'keterangan_solutif', 'order_date', 'row_no', 'channel',
  'order_number', 'jl_number', 'order_status', 'sheet_dpp', 'marketplace_net_payout',
  'dpp_number', 'product_name', 'sku_utama', 'sku_pengganti', 'qty',
  'recheck_qty', 'package_count', 'buyer_username', 'est_net_income', 'shipping_courier',
  'created_at', 'updated_at'
];

for (let i = 0; i < records.length; i += BATCH_SIZE) {
  const chunk = records.slice(i, i + BATCH_SIZE);
  const values = chunk.map((rec) => {
    return '(' + cols.map((col) => escapeSql(rec[col])).join(', ') + ')';
  });
  sqlContent += `INSERT INTO cut_off_orders (${cols.join(', ')}) VALUES \n` + values.join(',\n') + ';\n';
}

fs.writeFileSync(sqlFile, sqlContent, 'utf8');
console.log(`Generated SQL file at ${sqlFile} with size ${fs.statSync(sqlFile).size} bytes`);

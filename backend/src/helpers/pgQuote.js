/** Quote identifier PostgreSQL an toàn (tên bảng từ information_schema). */
function quotePgIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(String(name))) {
    throw new Error(`Invalid PG identifier: ${name}`);
  }
  return `"${String(name).replace(/"/g, '""')}"`;
}

module.exports = { quotePgIdent };

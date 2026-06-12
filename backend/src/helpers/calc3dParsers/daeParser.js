/**
 * COLLADA / DAE parser — xuất từ SketchUp:
 *   File → Export → 3D Model → .dae
 *
 * Chiến lược (đủ tốt cho SketchUp):
 *   1) Đọc <unit meter="…"> trong <asset> → để chuyển về mm.
 *   2) Build map geometryId → AABB local (min/max của <float_array>).
 *   3) Duyệt <visual_scene>, với mỗi <node> có name (kể cả node lồng):
 *        - Tích lũy ma trận 4×4 (matrix / translate / rotate / scale).
 *        - Nếu node có <instance_geometry url="#G">, lấy AABB local của G,
 *          biến đổi 8 đỉnh qua matrix → AABB world → W,H,D (mm).
 *        - Cộng dồn theo tên (gộp các instance trùng tên thành 1 item, qty++).
 *
 * Không phụ thuộc lib XML — dùng regex đủ cho COLLADA chuẩn của SketchUp.
 */

// ── Vec/Matrix tiện ích ─────────────────────────────────────────────────────
function matIdentity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
function matMul(A, B) {
  const M = new Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      M[r * 4 + c] =
        A[r * 4 + 0] * B[0 * 4 + c] +
        A[r * 4 + 1] * B[1 * 4 + c] +
        A[r * 4 + 2] * B[2 * 4 + c] +
        A[r * 4 + 3] * B[3 * 4 + c];
    }
  }
  return M;
}
function matTranslate(t) {
  const M = matIdentity();
  M[3] = t[0]; M[7] = t[1]; M[11] = t[2];
  return M;
}
function matScale(s) {
  const M = matIdentity();
  M[0] = s[0]; M[5] = s[1]; M[10] = s[2];
  return M;
}
function matRotateAxis(axis, degRad) {
  // axis = [x,y,z,angleDeg] theo COLLADA
  const x = axis[0], y = axis[1], z = axis[2];
  const a = (degRad * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a), C = 1 - c;
  const len = Math.hypot(x, y, z) || 1;
  const ux = x / len, uy = y / len, uz = z / len;
  return [
    c + ux * ux * C,        ux * uy * C - uz * s, ux * uz * C + uy * s, 0,
    uy * ux * C + uz * s,   c + uy * uy * C,      uy * uz * C - ux * s, 0,
    uz * ux * C - uy * s,   uz * uy * C + ux * s, c + uz * uz * C,      0,
    0, 0, 0, 1,
  ];
}
function matApply(M, p) {
  return [
    M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + M[3],
    M[4] * p[0] + M[5] * p[1] + M[6] * p[2] + M[7],
    M[8] * p[0] + M[9] * p[1] + M[10] * p[2] + M[11],
  ];
}

// ── Tách block <tag> đầu tiên hoặc tất cả ───────────────────────────────────
function findAllElements(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*?>([\\s\\S]*?)<\\/${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push({ inner: m[1], full: m[0], openTag: m[0].slice(0, m[0].indexOf('>') + 1) });
  }
  return out;
}
function findAllSelfClosing(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*\\/>`, 'g');
  return xml.match(re) || [];
}
function attr(openTag, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`);
  const m = openTag.match(re);
  return m ? m[1] : null;
}
function getFirst(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*?>([\\s\\S]*?)<\\/${tag}>`);
  const m = xml.match(re);
  return m ? m[1] : null;
}

// ── Bước 1: Map geometryId → AABB local ─────────────────────────────────────
function buildGeometryAabbs(xml) {
  const map = new Map();
  const libs = findAllElements(xml, 'library_geometries');
  for (const lib of libs) {
    const geos = findAllElements(lib.inner, 'geometry');
    for (const g of geos) {
      const id = attr(g.openTag, 'id');
      if (!id) continue;
      // Lấy <source><float_array>… đầu tiên trong <mesh> — SketchUp luôn để positions đầu.
      const mesh = getFirst(g.inner, 'mesh');
      if (!mesh) continue;
      const sources = findAllElements(mesh, 'source');
      let positions = null;
      for (const s of sources) {
        const fa = getFirst(s.inner, 'float_array');
        if (fa) {
          const nums = fa.trim().split(/\s+/).map(Number).filter((n) => Number.isFinite(n));
          if (nums.length >= 3) { positions = nums; break; }
        }
      }
      if (!positions) continue;
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i + 2 < positions.length; i += 3) {
        const x = positions[i], y = positions[i + 1], z = positions[i + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      map.set(id, { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] });
    }
  }
  return map;
}

// ── Bước 2: Đệ quy duyệt <node> thu thập instances ─────────────────────────
function parseNodeMatrix(nodeInner) {
  // <matrix> ưu tiên; nếu không có thì compose từ translate/rotate/scale theo thứ tự xuất hiện.
  const m = nodeInner.match(/<matrix\b[^>]*?>([\s\S]*?)<\/matrix>/);
  if (m) {
    const v = m[1].trim().split(/\s+/).map(Number);
    if (v.length === 16 && v.every((x) => Number.isFinite(x))) return v;
  }
  let M = matIdentity();
  // Quét tuần tự các tag biến đổi để giữ đúng thứ tự.
  const re = /<(translate|rotate|scale)\b[^>]*?>([\s\S]*?)<\/\1>/g;
  let t;
  while ((t = re.exec(nodeInner)) !== null) {
    const tag = t[1];
    const nums = t[2].trim().split(/\s+/).map(Number);
    if (tag === 'translate' && nums.length >= 3) M = matMul(M, matTranslate(nums));
    else if (tag === 'scale' && nums.length >= 3) M = matMul(M, matScale(nums));
    else if (tag === 'rotate' && nums.length >= 4) M = matMul(M, matRotateAxis([nums[0], nums[1], nums[2]], nums[3]));
  }
  return M;
}

function aabbFromTransformed(localAabb, M) {
  const [minX, minY, minZ] = localAabb.min;
  const [maxX, maxY, maxZ] = localAabb.max;
  const corners = [
    [minX, minY, minZ], [maxX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ],
    [minX, minY, maxZ], [maxX, minY, maxZ], [minX, maxY, maxZ], [maxX, maxY, maxZ],
  ].map((p) => matApply(M, p));
  let nx = Infinity, ny = Infinity, nz = Infinity;
  let xx = -Infinity, xy = -Infinity, xz = -Infinity;
  for (const [x, y, z] of corners) {
    if (x < nx) nx = x; if (x > xx) xx = x;
    if (y < ny) ny = y; if (y > xy) xy = y;
    if (z < nz) nz = z; if (z > xz) xz = z;
  }
  return { min: [nx, ny, nz], max: [xx, xy, xz] };
}

/** Trả về `{ instances: [{ name, w, h, d }] }` (đơn vị = đơn vị file). */
function collectInstances(xml, geomMap) {
  // Lưu theo tên: [{ w, h, d, qty }] — gom item cùng tên + cùng kích thước
  const visualScene = (() => {
    const lib = findAllElements(xml, 'library_visual_scenes')[0];
    if (!lib) return null;
    const scene = findAllElements(lib.inner, 'visual_scene')[0];
    return scene ? scene.inner : null;
  })();
  if (!visualScene) return [];

  const instances = [];

  function walk(scope, parentMatrix, parentName) {
    // Tìm tất cả node trực tiếp ở level này (không greedy tham vào con).
    // Vì regex không hỗ trợ "balanced", ta dùng cách: split theo `<node\b` ở mức ngoài.
    // Heuristic đơn giản: dùng findAllElements - nó sẽ bắt cả nested. Để xử lý đúng,
    // ta sẽ duyệt RECURSIVE qua mỗi `<node>` block phát hiện được.
    const nodes = findTopLevelNodes(scope);
    for (const n of nodes) {
      const name = attr(n.openTag, 'name') || attr(n.openTag, 'id') || parentName || '(no name)';
      const localM = parseNodeMatrix(n.inner);
      const M = matMul(parentMatrix, localM);

      // Instance geometry trực tiếp trong node này
      const instGeoTags = findAllSelfClosing(n.inner, 'instance_geometry')
        .concat(findAllElements(n.inner, 'instance_geometry').map((e) => e.full));
      for (const tag of instGeoTags) {
        const url = (tag.match(/url\s*=\s*"#([^"]+)"/) || [])[1];
        if (!url) continue;
        const local = geomMap.get(url);
        if (!local) continue;
        const world = aabbFromTransformed(local, M);
        const w = world.max[0] - world.min[0];
        const h = world.max[2] - world.min[2]; // SketchUp Z = lên, dùng Z làm "cao"
        const d = world.max[1] - world.min[1]; // Y = sâu (axis Up: Y default DAE; SU export thường swap)
        instances.push({ name: cleanName(name), w, h, d });
      }

      // Instance node (tham chiếu node khác) — giữ đơn giản: bỏ qua, vì SU thường
      // export inline children. Nếu cần, có thể implement library_nodes resolver.

      // Đệ quy node con
      walk(n.inner, M, name);
    }
  }
  walk(visualScene, matIdentity(), null);
  return instances;
}

/** Lấy danh sách node ở cấp trên cùng của 1 chuỗi XML — cân bằng tag <node> ... </node>. */
function findTopLevelNodes(xml) {
  const result = [];
  const len = xml.length;
  let i = 0;
  while (i < len) {
    const idx = xml.indexOf('<node', i);
    if (idx < 0) break;
    // Bỏ qua nếu là tag tự đóng: <node ... />
    const closeTagAt = xml.indexOf('>', idx);
    if (closeTagAt < 0) break;
    const openTag = xml.slice(idx, closeTagAt + 1);
    const isSelf = openTag.endsWith('/>');
    if (isSelf) {
      result.push({ openTag, inner: '', full: openTag });
      i = closeTagAt + 1;
      continue;
    }
    // Tìm </node> tương ứng có tính lồng
    let depth = 1;
    let j = closeTagAt + 1;
    while (j < len && depth > 0) {
      const nextOpen = xml.indexOf('<node', j);
      const nextClose = xml.indexOf('</node>', j);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        // Bỏ qua self-closing nội bộ
        const nextCloseTag = xml.indexOf('>', nextOpen);
        if (nextCloseTag < 0) break;
        const nextOpenTag = xml.slice(nextOpen, nextCloseTag + 1);
        if (!nextOpenTag.endsWith('/>')) depth++;
        j = nextCloseTag + 1;
      } else {
        depth--;
        j = nextClose + '</node>'.length;
        if (depth === 0) {
          const inner = xml.slice(closeTagAt + 1, nextClose);
          result.push({ openTag, inner, full: xml.slice(idx, j) });
        }
      }
    }
    if (depth !== 0) break; // XML lỗi — dừng để khỏi loop vô hạn
    i = j;
  }
  return result;
}

function cleanName(s) {
  return String(s || '').replace(/^_+|_+$/g, '').replace(/[_]+/g, ' ').trim();
}

// ── Đơn vị: đọc <unit meter="..."> để chuyển sang mm ────────────────────────
function readMetersPerUnit(xml) {
  const m = xml.match(/<unit\b[^>]*\bmeter\s*=\s*"([\d.eE+-]+)"/);
  const v = m ? Number(m[1]) : 1;
  return Number.isFinite(v) && v > 0 ? v : 1;
}

// ── Public API ──────────────────────────────────────────────────────────────
async function parseDaeBuffer(buffer) {
  const xml = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer);
  if (!/<\s*COLLADA\b/i.test(xml)) {
    throw new Error('File không phải định dạng COLLADA/DAE hợp lệ.');
  }
  const metersPerUnit = readMetersPerUnit(xml);
  const mmPerUnit = metersPerUnit * 1000;

  const geomMap = buildGeometryAabbs(xml);
  if (!geomMap.size) {
    return { items: [], meta: { source: 'dae', metersPerUnit, geometries: 0 } };
  }
  const rawInstances = collectInstances(xml, geomMap);

  // Gom theo "name + dimensions làm tròn 1mm" → qty
  const groupedMap = new Map();
  for (const it of rawInstances) {
    const w = Math.round(it.w * mmPerUnit);
    const h = Math.round(it.h * mmPerUnit);
    const d = Math.round(it.d * mmPerUnit);
    if (![w, h, d].every((n) => Number.isFinite(n))) continue;
    const key = `${cleanName(it.name)}|${w}|${h}|${d}`;
    const cur = groupedMap.get(key);
    if (cur) cur.qty += 1;
    else groupedMap.set(key, { name: cleanName(it.name), w, h, d, qty: 1 });
  }
  const items = [...groupedMap.values()].map((it) => ({
    name: it.name,
    w: it.w, h: it.h, d: it.d, qty: it.qty,
    raw: `${it.name} | ${it.w}×${it.h}×${it.d}mm × ${it.qty}`,
  }));

  return {
    items,
    meta: {
      source: 'dae',
      metersPerUnit,
      geometries: geomMap.size,
      raw_instances: rawInstances.length,
      grouped: items.length,
    },
  };
}

module.exports = {
  key: 'dae',
  exts: ['.dae'],
  status: 'ready',
  canParse(file) {
    return String(file.ext || '').toLowerCase() === '.dae';
  },
  async parse(buffer) {
    return parseDaeBuffer(buffer);
  },
  // Cho kmzParser dùng lại
  _parseDaeBuffer: parseDaeBuffer,
};

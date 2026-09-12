#!/usr/bin/env python3
"""
Rà soát tĩnh mã backend, tìm hai loại lỗi IM LẶNG của PostgREST/Supabase:

  A. Cột được select nhưng KHÔNG tồn tại trong schema thật.
     Hậu quả: Postgres trả 42703 -> CẢ câu hỏng -> `data` là undefined.
     Vì hầu hết chỗ gọi không kiểm tra `error`, tính năng chết lặng lẽ.

  B. Lỗi bị nuốt: `const { data } = await supabase...` mà không lấy `error`.
     Đây là thứ biến A từ "một dòng log" thành "tính năng hỏng không ai biết".
"""
import json, re, os, sys
from collections import defaultdict

SCHEMA = json.load(open('/home/claude/schema.json'))
COLS = {t: set(c) for t, c in SCHEMA.items()}

# Token trong chuỗi select không phải tên cột
NOT_A_COLUMN = {'*', 'count', ''}

def split_top(s):
    """Tách theo dấu phẩy ở cấp ngoài cùng, bỏ qua phẩy nằm trong ngoặc."""
    out, depth, cur = [], 0, ''
    for ch in s:
        if ch == '(':
            depth += 1; cur += ch
        elif ch == ')':
            depth -= 1; cur += ch
        elif ch == ',' and depth == 0:
            out.append(cur); cur = ''
        else:
            cur += ch
    if cur.strip():
        out.append(cur)
    return [x.strip() for x in out if x.strip()]

def check_select(sel, table, path, findings, file, line):
    """Duyệt đệ quy chuỗi select của PostgREST."""
    if table not in COLS:
        return                                    # bảng lạ -> bỏ qua, không đoán
    for tok in split_top(sel):
        if '${' in tok or '`' in tok:
            continue                              # có nội suy -> không phân giải tĩnh được
        if '(' in tok:                            # đây là embed
            head, _, rest = tok.partition('(')
            inner = rest.rsplit(')', 1)[0]
            head = head.strip()
            rel = head.split(':', 1)[1] if ':' in head else head
            rel = rel.split('!', 1)[0].strip()    # bỏ gợi ý khoá ngoại
            if rel in COLS:
                check_select(inner, rel, path + '.' + rel, findings, file, line)
            continue
        name = tok.split(':', 1)[1] if ':' in tok else tok
        name = name.split('::', 1)[0].split('.')[-1].strip()
        name = name.split('!', 1)[0].strip()
        if name in NOT_A_COLUMN or not re.fullmatch(r'[a-z_][a-z0-9_]*', name):
            continue
        if name not in COLS[table]:
            findings.append({
                'file': file, 'line': line, 'table': table,
                'column': name, 'path': path,
                'goi_y': sorted(c for c in COLS[table]
                                if c.startswith(name[:4]) or name[:4] in c)[:3],
            })

STR = r"""(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`)"""
# BẮT MỌI .from(...) — kể cả khi tham số là BIẾN. Nếu cái .from() gần nhất phía
# trước một .select() là biến, ta KHÔNG biết bảng nào nên phải bỏ qua, chứ không
# được vơ lấy .from('literal') ở xa hơn. Đây chính là nguồn lỗi giả đầu tiên:
# `.from(VC_PIPELINE_TABLE).select('crm_sync_type, ...')` bị gán nhầm cho bảng
# `projects` chỉ vì phía trên có một .from('projects').
RE_FROM_ANY = re.compile(r"\.from\(\s*([^)]*?)\s*\)")
RE_FROM   = re.compile(r"\.from\(\s*" + STR + r"\s*\)")
RE_SELECT = re.compile(r"\.select\(\s*" + STR)
# .select(BIEN) — chuoi select nam trong mot hang ky tu khai bao truoc do.
# BO SOT THAT (08/09/2026): routes/management.js dung `const listSelect = \`...\`` roi
# `.select(listSelect)`. Ban cu chi doc chuoi literal nen khong thay `crm_leads.budget`
# va `crm_leads.deadline` — hai cot khong ton tai, lam GET /management/deals tra HTTP 500.
RE_SELECT_VAR = re.compile(r"\.select\(\s*([A-Za-z_$][\w$]*)\s*[,)]")
RE_CONST_STR  = re.compile(r"(?:const|let|var)\s+(\w+)\s*=\s*" + STR + r"\s*;")
RE_SWALLOW = re.compile(r"const\s*\{\s*data(?:\s*:\s*\w+)?\s*\}\s*=\s*await\s")

def scan(root):
    missing, swallow = [], []
    nfiles = 0
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', '_to_delete', 'uploads')]
        for fn in files:
            if not fn.endswith('.js'):
                continue
            p = os.path.join(dirpath, fn)
            rel = os.path.relpath(p, root)
            try:
                src = open(p, encoding='utf-8', errors='replace').read()
            except Exception:
                continue
            nfiles += 1
            froms = []
            for m in RE_FROM_ANY.finditer(src):
                lit = RE_FROM.match(src, m.start())
                tbl = (lit.group(1) or lit.group(2) or lit.group(3)) if lit else None
                if tbl is not None and '${' in tbl:
                    tbl = None          # template có nội suy -> không xác định
                froms.append((m.start(), tbl))
            # Hằng chuỗi khai báo trong file -> để giải .select(BIẾN)
            const_str = {}
            for cm in RE_CONST_STR.finditer(src):
                val = cm.group(2) or cm.group(3) or cm.group(4) or ''
                if '${' in val:
                    continue            # template nội suy -> không xác định
                const_str[cm.group(1)] = val

            def xet(sel, pos):
                prev = [t for p2, t in froms if p2 < pos]
                if not prev or prev[-1] is None:
                    return              # .from() gần nhất là biến -> không đoán bảng
                line = src.count('\n', 0, pos) + 1
                check_select(sel, prev[-1], prev[-1], missing, rel, line)

            for m in RE_SELECT.finditer(src):
                xet(m.group(1) or m.group(2) or m.group(3) or '', m.start())
            for m in RE_SELECT_VAR.finditer(src):
                sel = const_str.get(m.group(1))
                if sel:
                    xet(sel, m.start())
            for m in RE_SWALLOW.finditer(src):
                tail = src[m.start(): m.start() + 400]
                if 'supabase' in tail or '.from(' in tail or '.rpc(' in tail:
                    swallow.append((rel, src.count('\n', 0, m.start()) + 1))
    return missing, swallow, nfiles

root = sys.argv[1]
missing, swallow, nfiles = scan(root)

print(f"Đã quét {nfiles} file .js dưới {root}\n")
print("=" * 78)
print("A. CỘT KHÔNG TỒN TẠI TRONG SCHEMA  (mỗi cái làm CẢ câu truy vấn hỏng)")
print("=" * 78)
if not missing:
    print("  (không tìm thấy)")
else:
    by = defaultdict(list)
    for f in missing:
        by[(f['table'], f['column'])].append(f)
    for (t, c), items in sorted(by.items(), key=lambda kv: -len(kv[1])):
        goi = items[0]['goi_y']
        print(f"\n  {t}.{c}   ({len(items)} chỗ)" + (f"   — cột gần giống: {', '.join(goi)}" if goi else ""))
        for it in items[:6]:
            print(f"      {it['file']}:{it['line']}   (đường: {it['path']})")

print()
print("=" * 78)
print(f"B. LỖI BỊ NUỐT: `const {{ data }} = await …` không lấy `error`  — {len(swallow)} chỗ")
print("=" * 78)
agg = defaultdict(int)
for f, l in swallow:
    agg[f] += 1
for f, n in sorted(agg.items(), key=lambda kv: -kv[1])[:15]:
    print(f"  {n:4d}  {f}")
print(f"\n  … tổng {len(swallow)} chỗ trong {len(agg)} file")

# Xuất danh sách ứng viên để kiểm chứng trực tiếp trên DB
import json as _json
_pairs = sorted({(f['table'], f['column']) for f in missing})
_json.dump([{'table': t, 'column': c} for t, c in _pairs], open('/home/claude/audit/candidates.json', 'w'))
print(f"\n[đã ghi {len(_pairs)} cặp (bảng, cột) ra candidates.json để kiểm chứng trên DB]")

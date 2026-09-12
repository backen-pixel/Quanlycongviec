#!/usr/bin/env python3
"""Xuất báo cáo: mỗi cột thiếu + có kiểm tra error hay không + gợi ý cột đúng."""
import json, re, os, sys, difflib
from collections import defaultdict
sys.path.insert(0, '/home/claude/audit')

SCHEMA = json.load(open('/home/claude/schema.json'))
COLS = {t: set(c) for t, c in SCHEMA.items()}
NOT_A_COLUMN = {'*', 'count', ''}

def split_top(s):
    out, depth, cur = [], 0, ''
    for ch in s:
        if ch == '(': depth += 1; cur += ch
        elif ch == ')': depth -= 1; cur += ch
        elif ch == ',' and depth == 0: out.append(cur); cur = ''
        else: cur += ch
    if cur.strip(): out.append(cur)
    return [x.strip() for x in out if x.strip()]

def walk(sel, table, findings, file, pos, src):
    if table not in COLS: return
    for tok in split_top(sel):
        if '${' in tok: continue
        if '(' in tok:
            head, _, rest = tok.partition('(')
            inner = rest.rsplit(')', 1)[0]
            head = head.strip()
            rel = head.split(':', 1)[1] if ':' in head else head
            rel = rel.split('!', 1)[0].strip()
            if rel in COLS: walk(inner, rel, findings, file, pos, src)
            continue
        name = tok.split(':', 1)[1] if ':' in tok else tok
        name = name.split('::', 1)[0].split('.')[-1].split('!', 1)[0].strip()
        if name in NOT_A_COLUMN or not re.fullmatch(r'[a-z_][a-z0-9_]*', name): continue
        if name not in COLS[table]:
            close = difflib.get_close_matches(name, COLS[table], n=2, cutoff=0.55)
            findings.append((table, name, file, src.count('\n', 0, pos) + 1, close, pos))

STR = r"""(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`)"""
RE_FROM_ANY = re.compile(r"\.from\(\s*([^)]*?)\s*\)")
RE_FROM = re.compile(r"\.from\(\s*" + STR + r"\s*\)")
RE_SELECT = re.compile(r"\.select\(\s*" + STR)

def err_handled(src, pos):
    """Xem quanh lời gọi có lấy `error` ra không -> lỗi ồn hay lỗi im lặng."""
    start = src.rfind('const', max(0, pos - 900), pos)
    if start < 0: start = max(0, pos - 900)
    window = src[start: pos + 600]
    return bool(re.search(r'\berror\b|\bErr\b|\bError\b', window))

root = sys.argv[1]
rows = []
for dirpath, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', '_to_delete', 'uploads')]
    for fn in files:
        if not fn.endswith('.js'): continue
        p = os.path.join(dirpath, fn); rel = os.path.relpath(p, root)
        src = open(p, encoding='utf-8', errors='replace').read()
        froms = []
        for m in RE_FROM_ANY.finditer(src):
            lit = RE_FROM.match(src, m.start())
            t = (lit.group(1) or lit.group(2) or lit.group(3)) if lit else None
            if t and '${' in t: t = None
            froms.append((m.start(), t))
        for m in RE_SELECT.finditer(src):
            sel = m.group(1) or m.group(2) or m.group(3) or ''
            prev = [t for pos, t in froms if pos < m.start()]
            if not prev or prev[-1] is None: continue
            walk(sel, prev[-1], rows, rel, m.start(), src)
        for r in rows:
            if r[2] == rel and len(r) == 6:
                pass
# gắn cờ error-handling
out = []
cache = {}
for table, col, file, line, close, pos in rows:
    p = os.path.join(root, file)
    if p not in cache: cache[p] = open(p, encoding='utf-8', errors='replace').read()
    out.append({'bang': table, 'cot_sai': col, 'file': file, 'dong': line,
                'goi_y': close, 'co_bat_loi': err_handled(cache[p], pos)})

by = defaultdict(list)
for r in out: by[(r['bang'], r['cot_sai'])].append(r)

print(f"# Rà soát cột không tồn tại — {len(by)} cột sai, {len(out)} vị trí gọi\n")
print("Mỗi dòng dưới đây là một truy vấn mà Postgres trả `42703` và **cả câu hỏng**.\n")
print("| Bảng.cột sai | Cột đúng (gợi ý) | Số chỗ | Kiểu hỏng | Vị trí |")
print("|---|---|---|---|---|")
for (t, c), items in sorted(by.items(), key=lambda kv: (-len(kv[1]), kv[0])):
    goi = ', '.join(f'`{g}`' for g in items[0]['goi_y']) or '—'
    silent = sum(1 for i in items if not i['co_bat_loi'])
    kind = ('IM LẶNG' if silent == len(items) else ('ném lỗi' if silent == 0 else f'{silent} im lặng / {len(items)-silent} ném'))
    locs = '<br>'.join(f"`{i['file']}:{i['dong']}`" for i in items[:4])
    if len(items) > 4: locs += f'<br>… +{len(items)-4}'
    print(f"| **`{t}.{c}`** | {goi} | {len(items)} | {kind} | {locs} |")

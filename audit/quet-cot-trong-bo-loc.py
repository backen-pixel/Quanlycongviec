# -*- coding: utf-8 -*-
"""
Gom mọi cặp (bảng, cột) dùng trong BỘ LỌC PostgREST — .eq/.in/.lt/.order/...

Vì sao cần bản này bên cạnh audit.py:
  audit.py chỉ đọc chuỗi trong `.select(...)`. Nhưng cột sai trong bộ lọc cũng
  huỷ CẢ câu y hệt, mà `.select('*')` thì không có gì để đối chiếu. Đúng lỗ hổng
  đó đã giấu `projects.due_date` (45 lỗi/giờ trên dashboard) suốt nhiều tháng.

Cách dùng:
  1) python3 quet-cot-trong-bo-loc.py        -> in ra danh sách VALUES
  2) Dán danh sách vào câu SQL dưới đây để hỏi schema thật:

     with can(bang, cot) as (values <DÁN VÀO ĐÂY>)
     select can.* from can
     where not exists (select 1 from information_schema.columns c
                       where c.table_schema='public'
                         and c.table_name=can.bang and c.column_name=can.cot);

  3) MỖI cặp trả về phải RÀ TAY. Bộ quét gán cột cho `.from()` gần nhất trong
     cửa sổ 800 ký tự, nên khi một hàm dựng nhiều truy vấn cùng lúc sẽ gán nhầm.
     Lần chạy 08/09/2026: 20 cặp nghi ngờ -> 6 lỗi thật, 14 báo động giả.
"""

import os, re, json
SRC = os.path.expanduser('~/mnt/Quanlycongviec/backend/src')
FILTER = re.compile(r"\.(eq|neq|lt|lte|gt|gte|in|is|not|order|contains|overlaps|ilike|like)\(\s*['\"]([A-Za-z_][A-Za-z0-9_]*)['\"]")
FROM   = re.compile(r"\.from\(\s*['\"]([A-Za-z_][A-Za-z0-9_]*)['\"]\s*\)")
pairs = {}
for root, dirs, files in os.walk(SRC):
    dirs[:] = [d for d in dirs if d != 'node_modules']
    for fn in files:
        if not fn.endswith('.js'): continue
        p = os.path.join(root, fn)
        s = open(p, encoding='utf-8', errors='replace').read()
        rel = os.path.relpath(p, SRC).replace('\\', '/')
        for m in FROM.finditer(s):
            table = m.group(1)
            # cua so 800 ky tu sau .from(...) — du cho mot chuoi goi
            win = s[m.end(): m.end() + 800]
            # cat o .from(...) tiep theo de khong lan sang truy van khac
            nxt = FROM.search(win)
            if nxt: win = win[:nxt.start()]
            for f in FILTER.finditer(win):
                col = f.group(2)
                line = s[:m.end()].count('\n') + 1
                pairs.setdefault((table, col), set()).add(f'{rel}:{line}')
out = [{'bang': t, 'cot': c, 'cho': sorted(v)[:3]} for (t, c), v in sorted(pairs.items())]
open(os.path.expanduser('~/cap_loc.json'), 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False))
print('so cap (bang, cot):', len(out))
print('so bang:', len({o['bang'] for o in out}))
# in danh sach gon de doi chieu
print('---VALUES---')
print(','.join("('%s','%s')" % (o['bang'], o['cot']) for o in out))

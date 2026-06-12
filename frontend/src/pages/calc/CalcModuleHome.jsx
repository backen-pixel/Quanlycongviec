import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Calculator, Settings, FileUp, History, FolderTree, Boxes, Sigma } from 'lucide-react';
import api from '../../lib/api';

export default function CalcModuleHome() {
  const [stats, setStats] = useState({ categories: 0, types: 0, runs: 0, imports: 0 });

  useEffect(() => {
    Promise.allSettled([
      api.get('/calc/categories', { params: { active: 1 } }),
      api.get('/calc/product-types', { params: { active: 1 } }),
      api.get('/calc/runs', { params: { limit: 500 } }),
      api.get('/calc/imports', { params: { limit: 500 } }),
    ]).then(([cat, pt, run, imp]) => {
      setStats({
        categories: cat.status === 'fulfilled' ? (cat.value.data?.categories?.length || 0) : 0,
        types: pt.status === 'fulfilled' ? (pt.value.data?.product_types?.length || 0) : 0,
        runs: run.status === 'fulfilled' ? (run.value.data?.runs?.length || 0) : 0,
        imports: imp.status === 'fulfilled' ? (imp.value.data?.imports?.length || 0) : 0,
      });
    });
  }, []);

  const cards = [
    {
      to: '/calc/setup',
      icon: Settings,
      title: 'Cấu hình tính toán',
      desc: 'Danh mục → Loại sản phẩm → Biến → Công thức → Rule điều kiện',
      color: 'from-violet-500 to-indigo-600',
    },
    {
      to: '/calc/run',
      icon: Calculator,
      title: 'Tính nhanh',
      desc: 'Chọn loại sản phẩm, nhập kích thước → ra kết quả tức thì',
      color: 'from-emerald-500 to-teal-600',
    },
    {
      to: '/calc/import-3d',
      icon: FileUp,
      title: 'Tính từ file 3D',
      desc: 'Upload CSV / XLSX / JSON xuất từ phần mềm 3D, auto-tính từng item',
      color: 'from-orange-500 to-amber-600',
    },
    {
      to: '/calc/history',
      icon: History,
      title: 'Lịch sử tính',
      desc: 'Tra lại các lượt đã tính (manual + import file)',
      color: 'from-sky-500 to-blue-600',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shadow">
          <Sigma className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tính toán</h1>
          <p className="text-sm text-gray-500">Cấu hình công thức + tính giá trị từ kích thước hoặc file 3D.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Danh mục" value={stats.categories} icon={FolderTree} />
        <Stat label="Loại sản phẩm" value={stats.types} icon={Boxes} />
        <Stat label="Lượt tính" value={stats.runs} icon={Calculator} />
        <Stat label="File 3D đã import" value={stats.imports} icon={FileUp} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="group block bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md hover:border-gray-300 transition-all"
          >
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center text-white shadow group-hover:scale-105 transition-transform`}>
                <c.icon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-gray-900 group-hover:text-blue-600">{c.title}</h3>
                <p className="text-sm text-gray-500 mt-1">{c.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

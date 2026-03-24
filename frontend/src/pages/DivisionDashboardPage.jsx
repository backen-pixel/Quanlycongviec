import { useState, useEffect } from 'react';
import api from '../lib/api';
import { STATUS_LABELS, STATUS_COLORS } from '../lib/utils';
import { Building2, FolderKanban, CheckSquare, AlertTriangle, Clock, Users, Filter, BarChart3 } from 'lucide-react';

export default function DivisionDashboardPage() {
  const [divisions, setDivisions] = useState([]);
  const [selectedDiv, setSelectedDiv] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/divisions')
      .then(r => {
        const divs = r.data.divisions || [];
        setDivisions(divs);
        if (divs.length > 0) setSelectedDiv(divs[0].id);
      })
      .catch(() => {})
      .finally(() => setInitLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedDiv) return;
    setLoading(true);
    const params = {};
    if (selectedCompany) params.company_id = selectedCompany;
    api.get(`/divisions/${selectedDiv}/dashboard`, { params })
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [selectedDiv, selectedCompany]);

  useEffect(() => {
    setSelectedCompany('');
  }, [selectedDiv]);

  const division = divisions.find(d => d.id === selectedDiv);
  const companies = data?.companies || [];
  const projects = data?.projects || [];
  const tasks = data?.tasks || [];
  const stats = data?.stats || {};

  const activeProjects = projects.filter(p => !['completed','warranty','cancelled'].includes(p.status));
  const completedTaskCount = tasks.filter(t => t.status === 'done' || t.status === 'completed').length;
  const overdueTaskCount = tasks.filter(t => t.status !== 'done' && t.status !== 'completed' && t.due_date && new Date(t.due_date) < new Date()).length;

  if (initLoading) return <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-blue-200 border-t-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-indigo-600" /> Dashboard Khối
        </h1>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select value={selectedDiv} onChange={e => setSelectedDiv(e.target.value)}
            className="h-9 px-3 border rounded-lg text-sm font-medium bg-white">
            <option value="">— Chọn Khối —</option>
            {divisions.map(d => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
          </select>
          {companies.length > 0 && (
            <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}
              className="h-9 px-3 border rounded-lg text-sm bg-white">
              <option value="">Tất cả công ty</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.short_name || c.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Division Banner */}
      {division && (
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl p-5 text-white">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{division.icon || '🏢'}</span>
            <div>
              <h2 className="text-lg font-bold">{division.name}</h2>
              <p className="text-blue-100 text-xs mt-0.5">{companies.length} công ty • {projects.length} dự án • {tasks.length} nhiệm vụ</p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
      ) : !selectedDiv ? (
        <div className="text-center py-16 text-gray-400"><p>Chọn khối để xem dashboard</p></div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-xl border p-4">
              <FolderKanban className="h-5 w-5 text-indigo-500 mb-1" />
              <p className="text-2xl font-bold text-gray-900">{projects.length}</p>
              <p className="text-[10px] text-gray-500">Tổng dự án</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <Clock className="h-5 w-5 text-blue-500 mb-1" />
              <p className="text-2xl font-bold text-blue-600">{activeProjects.length}</p>
              <p className="text-[10px] text-gray-500">Đang hoạt động</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <CheckSquare className="h-5 w-5 text-emerald-500 mb-1" />
              <p className="text-2xl font-bold text-gray-900">{tasks.length}</p>
              <p className="text-[10px] text-gray-500">Tổng nhiệm vụ</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <CheckSquare className="h-5 w-5 text-green-500 mb-1" />
              <p className="text-2xl font-bold text-green-600">{completedTaskCount}</p>
              <p className="text-[10px] text-gray-500">Đã hoàn thành</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <AlertTriangle className="h-5 w-5 text-red-500 mb-1" />
              <p className="text-2xl font-bold text-red-600">{overdueTaskCount}</p>
              <p className="text-[10px] text-gray-500">Quá hạn</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <Users className="h-5 w-5 text-purple-500 mb-1" />
              <p className="text-2xl font-bold text-gray-900">{stats.members || 0}</p>
              <p className="text-[10px] text-gray-500">Nhân viên</p>
            </div>
          </div>

          {/* Company breakdown — only when viewing all companies */}
          {!selectedCompany && companies.length > 1 && (
            <div className="bg-white rounded-xl border p-4">
              <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-blue-600" /> Theo Công ty</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {companies.map(c => {
                  const cProjects = projects.filter(p => p.company_id === c.id || p.company?.id === c.id);
                  const cTasks = tasks.filter(t => cProjects.some(p => p.id === t.project_id));
                  return (
                    <button key={c.id} onClick={() => setSelectedCompany(c.id)}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer text-left transition-colors">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-xs font-bold text-blue-700">{(c.short_name || c.name || '?')[0]}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">{c.short_name || c.name}</p>
                        <p className="text-[10px] text-gray-400">{cProjects.length} DA • {cTasks.length} NV</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Projects Table */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">📋 Dự án ({projects.length})</h3>
              {selectedCompany && (
                <button onClick={() => setSelectedCompany('')} className="text-xs text-blue-600 hover:underline cursor-pointer">← Xem tất cả công ty</button>
              )}
            </div>
            {projects.length > 0 ? (
              <div className="divide-y max-h-96 overflow-y-auto">
                {projects.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-[10px] text-gray-400">{p.code} • {p.customer_name || p.company?.short_name || ''}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600'}`}>{STATUS_LABELS[p.status] || p.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 text-sm">Chưa có dự án</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

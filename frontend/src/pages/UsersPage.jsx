import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Users as UsersIcon } from 'lucide-react';

const roleLabels = { admin:'Admin', manager:'Quản lý', sales:'Kinh doanh', designer:'Thiết kế', production:'Sản xuất', driver:'Tài xế', installer:'Lắp đặt', customer_care:'CSKH', staff:'Nhân viên' };

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  useEffect(() => { api.get('/users').then(r => setUsers(r.data.users || [])); }, []);

  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold flex items-center gap-2"><UsersIcon className="h-6 w-6" /> Nhân Viên</h1></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {users.map(u => (
          <div key={u.id} className="bg-white rounded-xl border p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">{u.full_name?.[0]}</div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">{u.full_name}</h3>
              <p className="text-xs text-gray-500">{u.email}</p>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{roleLabels[u.role] || u.role}</span>
            </div>
            <p className="text-xs text-gray-400">{u.phone}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

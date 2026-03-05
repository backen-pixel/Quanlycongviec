import { useState } from 'react';
import { ChevronDown, ChevronRight, Users, Edit, Trash2, Plus, Building2, Briefcase } from 'lucide-react';
import { Crown, Shield, User } from 'lucide-react';

const RL = { director: 'Giám đốc', manager: 'Quản lý', team_lead: 'Trưởng nhóm', member: 'Nhân viên' };
const RC = { director: 'bg-purple-100 text-purple-700', manager: 'bg-blue-100 text-blue-700', team_lead: 'bg-amber-100 text-amber-700', member: 'bg-gray-100 text-gray-600' };
const RI = { director: Crown, manager: Shield, team_lead: Users, member: User };

export default function EcosystemListView({ tree, onSelect, onAddChild, isAdmin, allUsers }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-600" />
          Danh sách Đơn vị
        </h3>
        <p className="text-xs text-gray-600 mt-1">
          Click để xem chi tiết hoặc mở rộng/thu gọn cấu trúc
        </p>
      </div>

      <div className="divide-y divide-gray-200">
        {tree.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Chưa có đơn vị nào</p>
          </div>
        ) : (
          tree.map(root => (
            <UnitNode
              key={root.id}
              node={root}
              level={0}
              onSelect={onSelect}
              onAddChild={onAddChild}
              isAdmin={isAdmin}
              allUsers={allUsers}
            />
          ))
        )}
      </div>
    </div>
  );
}

function UnitNode({ node, level, onSelect, onAddChild, isAdmin, allUsers }) {
  const [expanded, setExpanded] = useState(level < 2); // Auto-expand first 2 levels

  const hasChildren = node.children && node.children.length > 0;
  const paddingLeft = level * 20;

  const getLevelIcon = () => {
    if (level === 0) return <Building2 className="w-4 h-4 text-blue-600" />;
    if (level === 1) return <Building2 className="w-4 h-4 text-purple-600" />;
    if (level === 2) return <Briefcase className="w-4 h-4 text-green-600" />;
    return <Users className="w-4 h-4 text-amber-600" />;
  };

  const getLevelBg = () => {
    if (level === 0) return 'bg-blue-50 hover:bg-blue-100';
    if (level === 1) return 'bg-purple-50 hover:bg-purple-100';
    if (level === 2) return 'bg-green-50 hover:bg-green-100';
    return 'bg-amber-50 hover:bg-amber-100';
  };

  // Count members
  const memberCount = node.members?.length || 0;
  const director = node.members?.find(m => m.unit_role === 'director');
  const directorUser = director ? allUsers.find(u => u.id === director.user_id) : null;

  return (
    <div>
      {/* Current Node */}
      <div
        className={`flex items-center gap-2 p-3 transition cursor-pointer ${getLevelBg()}`}
        style={{ paddingLeft: `${paddingLeft + 12}px` }}
      >
        {/* Expand/Collapse */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700"
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          ) : (
            <div className="w-4 h-4" /> // Spacer
          )}
        </button>

        {/* Icon */}
        <div className="flex-shrink-0">
          {getLevelIcon()}
        </div>

        {/* Info */}
        <div
          className="flex-1 min-w-0"
          onClick={() => onSelect(node.id)}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 truncate">{node.name}</span>
            {node.level_name && (
              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                {node.level_name}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3 text-xs text-gray-600 mt-0.5">
            {directorUser && (
              <span className="flex items-center gap-1">
                <Crown className="w-3 h-3 text-amber-600" />
                {directorUser.full_name || directorUser.email}
              </span>
            )}
            {memberCount > 0 && (
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {memberCount} người
              </span>
            )}
            {hasChildren && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {node.children.length} đơn vị con
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        {isAdmin && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(node.id);
              }}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-white rounded transition"
              title="Xem chi tiết"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddChild(node.id);
              }}
              className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-white rounded transition"
              title="Thêm đơn vị con"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <UnitNode
              key={child.id}
              node={child}
              level={level + 1}
              onSelect={onSelect}
              onAddChild={onAddChild}
              isAdmin={isAdmin}
              allUsers={allUsers}
            />
          ))}
        </div>
      )}
    </div>
  );
}

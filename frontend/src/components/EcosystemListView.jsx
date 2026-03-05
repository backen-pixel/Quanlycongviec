import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Users, Edit, Trash2, Plus, Building2, Briefcase, Search, X, Filter } from 'lucide-react';
import { Crown, Shield, User } from 'lucide-react';

const RL = { director: 'Giám đốc', manager: 'Quản lý', team_lead: 'Trưởng nhóm', member: 'Nhân viên' };
const RC = { director: 'bg-purple-100 text-purple-700', manager: 'bg-blue-100 text-blue-700', team_lead: 'bg-amber-100 text-amber-700', member: 'bg-gray-100 text-gray-600' };
const RI = { director: Crown, manager: Shield, team_lead: Users, member: User };

export default function EcosystemListView({ tree, onSelect, onAddChild, isAdmin, allUsers }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState('all'); // 'all' | 'division' | 'company' | 'department'

  // Flatten tree to search
  const flattenTree = (nodes, level = 0) => {
    let result = [];
    nodes.forEach(node => {
      result.push({ ...node, treeLevel: level });
      if (node.children && node.children.length > 0) {
        result = result.concat(flattenTree(node.children, level + 1));
      }
    });
    return result;
  };

  // Filter and search
  const filteredTree = useMemo(() => {
    if (!searchQuery && filterLevel === 'all') return tree;

    const allNodes = flattenTree(tree);
    
    // Filter by level
    let filtered = allNodes;
    if (filterLevel !== 'all') {
      const levelMap = { division: 1, company: 2, department: 3 };
      filtered = allNodes.filter(node => node.treeLevel === levelMap[filterLevel]);
    }

    // Search by name
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(node => 
        node.name.toLowerCase().includes(query) ||
        node.description?.toLowerCase().includes(query)
      );
    }

    // Rebuild tree structure with only matching nodes
    if (searchQuery || filterLevel !== 'all') {
      // For now, just show flat list when filtering
      return filtered.map(node => ({ ...node, children: [] }));
    }

    return tree;
  }, [tree, searchQuery, filterLevel]);

  const matchCount = searchQuery || filterLevel !== 'all' 
    ? flattenTree(filteredTree).length 
    : flattenTree(tree).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header with Search & Filter */}
      <div className="p-4 bg-gray-50 border-b border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              Danh sách Đơn vị
            </h3>
            <p className="text-xs text-gray-600 mt-1">
              {matchCount} đơn vị {(searchQuery || filterLevel !== 'all') && '(đã lọc)'}
            </p>
          </div>
        </div>

        {/* Search Box */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên đơn vị..."
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter Dropdown */}
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            <option value="all">Tất cả cấp</option>
            <option value="division">📦 Chỉ Khối</option>
            <option value="company">🏢 Chỉ Công ty</option>
            <option value="department">👔 Chỉ Phòng ban</option>
          </select>
        </div>

        {/* Active filters badge */}
        {(searchQuery || filterLevel !== 'all') && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-600">Đang lọc:</span>
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                "{searchQuery}"
                <button onClick={() => setSearchQuery('')} className="hover:text-blue-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filterLevel !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-full">
                {filterLevel === 'division' && '📦 Khối'}
                {filterLevel === 'company' && '🏢 Công ty'}
                {filterLevel === 'department' && '👔 Phòng ban'}
                <button onClick={() => setFilterLevel('all')} className="hover:text-purple-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            <button
              onClick={() => { setSearchQuery(''); setFilterLevel('all'); }}
              className="text-gray-500 hover:text-gray-700 underline"
            >
              Xóa tất cả
            </button>
          </div>
        )}
      </div>

      {/* List */}
      <div className="divide-y divide-gray-200">
        {filteredTree.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">Không tìm thấy đơn vị nào</p>
            <button
              onClick={() => { setSearchQuery(''); setFilterLevel('all'); }}
              className="mt-2 text-sm text-blue-600 hover:text-blue-700 underline"
            >
              Xóa bộ lọc
            </button>
          </div>
        ) : (
          filteredTree.map(root => (
            <UnitNode
              key={root.id}
              node={root}
              level={0}
              onSelect={onSelect}
              onAddChild={onAddChild}
              isAdmin={isAdmin}
              allUsers={allUsers}
              searchQuery={searchQuery}
            />
          ))
        )}
      </div>
    </div>
  );
}

function UnitNode({ node, level, onSelect, onAddChild, isAdmin, allUsers, searchQuery }) {
  const [expanded, setExpanded] = useState(level < 2); // Auto-expand first 2 levels

  // Highlight matching text
  const highlightText = (text) => {
    if (!searchQuery || !text) return text;
    
    const query = searchQuery.toLowerCase();
    const index = text.toLowerCase().indexOf(query);
    
    if (index === -1) return text;
    
    return (
      <>
        {text.substring(0, index)}
        <mark className="bg-yellow-200 text-gray-900">{text.substring(index, index + searchQuery.length)}</mark>
        {text.substring(index + searchQuery.length)}
      </>
    );
  };

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
            <span className="font-medium text-gray-900 truncate">{highlightText(node.name)}</span>
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
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
}

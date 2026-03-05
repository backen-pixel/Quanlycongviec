import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Check, ChevronDown, ChevronUp, Loader } from 'lucide-react';
import api from '../lib/api';
import TaskEditModal from './TaskEditModal';

export default function FlowStepTaskManager({ flowStep, templateSetId, onTasksChange }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [expandedTasks, setExpandedTasks] = useState({});
  const [employees, setEmployees] = useState([]);

  // Load tasks when flowStep or template changes
  useEffect(() => {
    if (flowStep?.id) {
      loadTasks();
    }
  }, [flowStep?.id, templateSetId]);

  // Load employees for the company
  useEffect(() => {
    if (flowStep?.company_unit_id) {
      loadEmployees(flowStep.company_unit_id);
    }
  }, [flowStep?.company_unit_id]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      // Try to load existing flow tasks
      const { data: flowTasks } = await api.get(`/flows/steps/${flowStep.id}/tasks`);
      
      if (flowTasks.tasks && flowTasks.tasks.length > 0) {
        // Use existing flow tasks
        setTasks(flowTasks.tasks);
      } else if (templateSetId) {
        // Load from template as starter
        const { data: templateData } = await api.get(
          `/company-templates/template-sets/${templateSetId}/tasks`
        );
        
        // Map template tasks to flow task format (not saved yet)
        const mappedTasks = (templateData.tasks || []).map(t => ({
          ...t,
          template_task_id: t.id,
          id: null, // Not saved yet
          flow_step_id: flowStep.id,
        }));
        
        setTasks(mappedTasks);
      } else {
        setTasks([]);
      }
    } catch (error) {
      console.error('Load tasks error:', error);
      alert('Lỗi khi tải tasks: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = async (companyUnitId) => {
    try {
      const { data } = await api.get(`/users?company_unit_id=${companyUnitId}`);
      setEmployees(data.users || []);
    } catch (error) {
      console.error('Load employees error:', error);
    }
  };

  const handleCreateTask = () => {
    setEditingTask({
      flow_step_id: flowStep.id,
      title: '',
      description: '',
      assignee_field: 'sales_person',
      assigned_user_id: null,
      estimated_days: 1,
      order_index: tasks.length,
      checklists: [],
    });
  };

  const handleEditTask = (task) => {
    setEditingTask({ ...task });
  };

  const handleSaveTask = async (taskData) => {
    try {
      let savedTask;
      
      if (taskData.id) {
        // Update existing task
        const { data } = await api.put(`/flows/steps/tasks/${taskData.id}`, taskData);
        savedTask = data.task;
      } else {
        // Create new task
        const { data } = await api.post('/flows/steps/tasks', {
          ...taskData,
          flow_step_id: flowStep.id,
        });
        savedTask = data.task;
      }

      // Save checklists
      if (taskData.checklists && taskData.checklists.length > 0) {
        for (const checklist of taskData.checklists) {
          if (checklist.id) {
            // Update existing checklist
            await api.put(
              `/flows/steps/tasks/${savedTask.id}/checklists/${checklist.id}`,
              checklist
            );
          } else {
            // Create new checklist
            await api.post(`/flows/steps/tasks/${savedTask.id}/checklists`, {
              ...checklist,
              flow_step_task_id: savedTask.id,
            });
          }
        }
      }

      // Reload tasks
      await loadTasks();
      setEditingTask(null);
      
      if (onTasksChange) onTasksChange();
    } catch (error) {
      console.error('Save task error:', error);
      alert('Lỗi khi lưu task: ' + error.message);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Xóa task này? Tất cả checklists sẽ bị xóa.')) return;
    
    try {
      await api.delete(`/flows/steps/tasks/${taskId}`);
      await loadTasks();
      
      if (onTasksChange) onTasksChange();
    } catch (error) {
      console.error('Delete task error:', error);
      alert('Lỗi khi xóa task: ' + error.message);
    }
  };

  const toggleTaskExpand = (taskId) => {
    setExpandedTasks(prev => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Đang tải tasks...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            📋 Nhiệm Vụ ({tasks.length})
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Quản lý nhiệm vụ và phân công nhân viên cụ thể
          </p>
        </div>
        <button
          onClick={handleCreateTask}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Thêm Task
        </button>
      </div>

      {/* Empty state */}
      {tasks.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
          <div className="text-4xl mb-3">📝</div>
          <h4 className="text-lg font-semibold text-gray-700 mb-2">
            Chưa có nhiệm vụ nào
          </h4>
          <p className="text-gray-500 mb-4">
            {templateSetId 
              ? 'Bấm "Thêm Task" để tạo nhiệm vụ mới'
              : 'Chọn Bộ Mẫu để tải tasks hoặc tạo task mới'}
          </p>
        </div>
      )}

      {/* Task list */}
      <div className="space-y-3">
        {tasks.map((task, idx) => (
          <div
            key={task.id || idx}
            className="bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
          >
            {/* Task header */}
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-gray-500">
                      #{idx + 1}
                    </span>
                    <h4 className="font-semibold text-gray-900 text-base">
                      {task.title}
                    </h4>
                    {task.stage && (
                      <span
                        className="px-2 py-0.5 text-xs font-medium rounded-full"
                        style={{
                          backgroundColor: task.stage.color + '20',
                          color: task.stage.color,
                        }}
                      >
                        {task.stage.name}
                      </span>
                    )}
                  </div>

                  {task.description && (
                    <p className="text-sm text-gray-600 mb-3">
                      {task.description}
                    </p>
                  )}

                  {/* Task meta */}
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {/* Assignee */}
                    {task.assigned_user ? (
                      <div className="flex items-center gap-1.5 text-green-700 bg-green-50 px-2 py-1 rounded">
                        <span>👤</span>
                        <span className="font-medium">
                          {task.assigned_user.full_name}
                        </span>
                      </div>
                    ) : task.assignee_field ? (
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <span>👤</span>
                        <span>
                          {task.assignee_field.replace('_', ' ')}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400 italic">Chưa gán</span>
                    )}

                    {/* Days */}
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <span>📅</span>
                      <span>{task.estimated_days} ngày</span>
                    </div>

                    {/* Checklists count */}
                    {task.checklists && task.checklists.length > 0 && (
                      <div className="flex items-center gap-1.5 text-blue-600">
                        <Check className="w-4 h-4" />
                        <span>{task.checklists.length} checklist</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleEditTask(task)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Sửa"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    disabled={!task.id}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Xóa"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {task.checklists && task.checklists.length > 0 && (
                    <button
                      onClick={() => toggleTaskExpand(task.id || idx)}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title={expandedTasks[task.id || idx] ? 'Thu gọn' : 'Mở rộng'}
                    >
                      {expandedTasks[task.id || idx] ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Checklists (expanded) */}
              {expandedTasks[task.id || idx] && task.checklists && task.checklists.length > 0 && (
                <div className="mt-4 pl-6 space-y-2 border-l-2 border-gray-200">
                  <div className="text-xs font-semibold text-gray-500 mb-2">
                    CHECKLIST:
                  </div>
                  {task.checklists.map((checklist, cIdx) => (
                    <div
                      key={checklist.id || cIdx}
                      className="flex items-center gap-2 text-sm"
                    >
                      <div className="w-4 h-4 border-2 border-gray-300 rounded flex items-center justify-center">
                        <Check className="w-3 h-3 text-gray-400" />
                      </div>
                      <span className="text-gray-700">{checklist.label}</span>
                      {checklist.is_required && (
                        <span className="text-red-500 text-xs">*</span>
                      )}
                      {checklist.assigned_user_id && (
                        <span className="text-xs text-blue-600 ml-auto">
                          (Gán riêng)
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          employees={employees}
          onSave={handleSaveTask}
          onCancel={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}

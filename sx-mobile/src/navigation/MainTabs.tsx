import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React, { useEffect, useState } from 'react';
import { DeviceEventEmitter, View } from 'react-native';
import CreateDealModal from '../components/CreateDealModal';
import Toast, { type ToastState } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { canViewTeamWork } from '../lib/roles';
import { useMessenger } from '../context/MessengerContext';
import { useTheme } from '../context/ThemeContext';
import KanbanScreen from '../screens/KanbanScreen';
import MessagesScreen from '../screens/MessagesScreen';
import OverviewScreen from '../screens/OverviewScreen';
import PlannerScreen from '../screens/PlannerScreen';
import ProfileScreen, { SX_OPEN_CREATE_DEAL } from '../screens/ProfileScreen';
import WorkScreen from '../screens/WorkScreen';
import FloatingTabBar from './FloatingTabBar';

export type WorkTabParams = {
  /** Lọc Đội / Tôi — Overview «của tôi» truyền `mine`. */
  scope?: 'mine' | 'team';
  status?: 'all' | 'pending' | 'in_progress' | 'completed' | 'overdue';
};

export type KanbanTabParams = {
  /** Mở board và focus thẻ (từ Tổng quan dự án quá hạn). */
  focusProjectId?: string;
  /** Áp quick filter bộ lọc chung (ProductionFilterSheet). */
  quickFilter?: 'all' | 'mine' | 'overdue' | 'today';
  /** list | kanban — mặc định giữ mode đã lưu. */
  viewMode?: 'list' | 'kanban';
};

export type MainTabParamList = {
  Overview: undefined;
  Kanban: KanbanTabParams | undefined;
  Work: WorkTabParams | undefined;
  CreateDeal: undefined;
  Messages: undefined;
  Planner: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function CreateDealPlaceholder() {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}

export default function MainTabs() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { unreadTotal: messageUnread } = useMessenger();

  const [dealOpen, setDealOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  /** Tạo đơn xưởng chỉ dành cho quản lý/admin. */
  const canCreateDeal = canViewTeamWork(user);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(SX_OPEN_CREATE_DEAL, () => {
      if (canCreateDeal) setDealOpen(true);
    });
    return () => sub.remove();
  }, [canCreateDeal]);

  const showToast = (msg: string) => {
    setToast({ message: msg, kind: 'success' });
    setTimeout(() => setToast(null), 2600);
  };

  return (
    <>
      <Tab.Navigator
        initialRouteName="Overview"
        // Thanh tab tự vẽ (nổi, bo tròn, chỉ báo dạng viên thuốc) — xem FloatingTabBar.
        tabBar={(props) => (
          <FloatingTabBar
            {...props}
            canCreate={canCreateDeal}
            onCreate={() => setDealOpen(true)}
            messageUnread={messageUnread}
          />
        )}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.bg },
          lazy: true,
          freezeOnBlur: true,
        }}
      >
        <Tab.Screen name="Overview" component={OverviewScreen} options={{ title: 'Tổng quan' }} />
        <Tab.Screen name="Kanban" component={KanbanScreen} options={{ title: 'Dự án' }} />
        {/* Ô giữa: nút + tạo đơn (chỉ quản lý/admin). Nhân viên không thấy nên 4 tab còn lại trải đều. */}
        <Tab.Screen name="CreateDeal" component={CreateDealPlaceholder} options={{ title: 'Tạo đơn' }} />
        <Tab.Screen name="Work" component={WorkScreen} options={{ title: 'Công việc' }} />
        <Tab.Screen name="Messages" component={MessagesScreen} options={{ title: 'Tin nhắn' }} />
        {/* Mở từ menu, không có chỗ trên thanh. */}
        <Tab.Screen name="Profile" component={ProfileScreen} />
        <Tab.Screen name="Planner" component={PlannerScreen} />
      </Tab.Navigator>

      {canCreateDeal ? (
        <CreateDealModal
          visible={dealOpen}
          user={user}
          onClose={() => setDealOpen(false)}
          onCreated={(msg) => showToast(msg)}
        />
      ) : null}

      <Toast state={toast} />
    </>
  );
}


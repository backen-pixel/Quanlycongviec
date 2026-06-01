import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MoreHomeScreen from '../screens/MoreHomeScreen';
import CrmEventsScreen from '../screens/CrmEventsScreen';
import FacebookInboxScreen from '../screens/FacebookInboxScreen';
import FacebookChatScreen from '../screens/FacebookChatScreen';
import AutoPipelineStatusScreen from '../screens/AutoPipelineStatusScreen';
import AccountScreen from '../screens/AccountScreen';
import MessengerGroupListScreen from '../screens/MessengerGroupListScreen';
import MessengerGroupChatScreen from '../screens/MessengerGroupChatScreen';
import MessengerComposeScreen from '../screens/MessengerComposeScreen';
import MessengerAddMembersScreen from '../screens/MessengerAddMembersScreen';
import SalesHubScreen from '../screens/SalesHubScreen';
import QuotationListScreen from '../screens/QuotationListScreen';
import QuotationDetailScreen from '../screens/QuotationDetailScreen';
import QuotationFormScreen from '../screens/QuotationFormScreen';
import QuotationExcelReviewScreen from '../screens/QuotationExcelReviewScreen';
import OrderListScreen from '../screens/OrderListScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import InvoiceListScreen from '../screens/InvoiceListScreen';
import InvoiceDetailScreen from '../screens/InvoiceDetailScreen';
import CrmDashboardScreen from '../screens/CrmDashboardScreen';
import CrmTasksOverviewScreen from '../screens/CrmTasksOverviewScreen';
import CustomerListScreen from '../screens/CustomerListScreen';
import CustomerDetailScreen from '../screens/CustomerDetailScreen';
import ProductListScreen from '../screens/ProductListScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import CategoryListScreen from '../screens/CategoryListScreen';
import CrmPipelineListScreen from '../screens/CrmPipelineListScreen';
import CrmPipelineDetailScreen from '../screens/CrmPipelineDetailScreen';
import CrmEmbeddedWebScreen from '../screens/CrmEmbeddedWebScreen';
import SocialFeedScreen from '../screens/SocialFeedScreen';
import SocialPostScreen from '../screens/SocialPostScreen';
import SocialProfileScreen from '../screens/SocialProfileScreen';
import BubblePermissionOnboardScreen from '../screens/BubblePermissionOnboardScreen';
import MyDevicesScreen from '../screens/MyDevicesScreen';
import WorkTaskListScreen from '../screens/WorkTaskListScreen';
import WorkTaskDetailScreen from '../screens/WorkTaskDetailScreen';
import WorkTaskFormScreen from '../screens/WorkTaskFormScreen';
import type { MoreStackParamList } from './types';
import { CrmColors } from '../theme/crmTheme';

const Stack = createNativeStackNavigator<MoreStackParamList>();

export default function MoreStackNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="MoreHome"
      screenOptions={{
        contentStyle: { backgroundColor: CrmColors.pageBg },
        headerStyle: {
          backgroundColor: CrmColors.white,
          borderBottomWidth: 1,
          borderBottomColor: CrmColors.tabBarBorder,
        } as never,
        headerTitleStyle: { fontWeight: '700', color: CrmColors.gray900, fontSize: 17 },
        headerTintColor: CrmColors.blue700,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="MoreHome" component={MoreHomeScreen} options={{ title: 'Menu' }} />
      <Stack.Screen name="CrmEvents" component={CrmEventsScreen} options={{ title: 'Sự kiện CRM' }} />
      <Stack.Screen name="FacebookInbox" component={FacebookInboxScreen} options={{ title: 'Facebook' }} />
      <Stack.Screen name="FacebookChat" component={FacebookChatScreen} options={{ title: 'Chat' }} />
      <Stack.Screen
        name="AutoPipelineStatus"
        component={AutoPipelineStatusScreen}
        options={{ title: 'Công cụ tự động' }}
      />
      <Stack.Screen name="AccountSettings" component={AccountScreen} options={{ title: 'Tài khoản' }} />
      <Stack.Screen name="MessengerGroupList" component={MessengerGroupListScreen} options={{ title: 'Tin nhắn' }} />
      <Stack.Screen
        name="MessengerGroupChat"
        component={MessengerGroupChatScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="MessengerCompose" component={MessengerComposeScreen} options={{ title: 'Tạo chat' }} />
      <Stack.Screen name="MessengerAddMembers" component={MessengerAddMembersScreen} options={{ title: 'Thêm thành viên' }} />
      <Stack.Screen name="SalesHub" component={SalesHubScreen} options={{ title: 'Bán hàng' }} />
      <Stack.Screen name="QuotationList" component={QuotationListScreen} options={{ title: 'Báo giá' }} />
      <Stack.Screen name="QuotationDetail" component={QuotationDetailScreen} options={{ title: 'Chi tiết' }} />
      <Stack.Screen name="QuotationForm" component={QuotationFormScreen} options={{ title: 'Báo giá' }} />
      <Stack.Screen name="QuotationExcelReview" component={QuotationExcelReviewScreen} options={{ title: 'Review Excel' }} />
      <Stack.Screen name="OrderList" component={OrderListScreen} options={{ title: 'Đơn hàng' }} />
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: 'Đơn hàng' }} />
      <Stack.Screen name="InvoiceList" component={InvoiceListScreen} options={{ title: 'Hóa đơn' }} />
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={{ title: 'Hóa đơn' }} />
      <Stack.Screen name="CrmDashboard" component={CrmDashboardScreen} options={{ title: 'Dashboard CRM' }} />
      <Stack.Screen name="CrmTasksOverview" component={CrmTasksOverviewScreen} options={{ title: 'Công việc CRM' }} />
      <Stack.Screen name="CustomerList" component={CustomerListScreen} options={{ title: 'Khách hàng' }} />
      <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} options={{ title: 'Khách hàng' }} />
      <Stack.Screen name="ProductList" component={ProductListScreen} options={{ title: 'Sản phẩm' }} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: 'Sản phẩm' }} />
      <Stack.Screen name="CategoryList" component={CategoryListScreen} options={{ title: 'Nhóm ngành' }} />
      <Stack.Screen name="CrmPipelineList" component={CrmPipelineListScreen} options={{ title: 'Pipeline' }} />
      <Stack.Screen name="CrmPipelineDetail" component={CrmPipelineDetailScreen} options={{ title: 'Chi tiết pipeline' }} />
      <Stack.Screen
        name="CrmEmbeddedWeb"
        component={CrmEmbeddedWebScreen}
        options={({ route }) => ({ title: route.params.title || 'Xem trên web' })}
      />
      <Stack.Screen name="SocialFeed" component={SocialFeedScreen} options={{ title: 'Bảng tin nội bộ' }} />
      <Stack.Screen name="SocialPost" component={SocialPostScreen} options={{ title: 'Bài viết' }} />
      <Stack.Screen name="SocialProfile" component={SocialProfileScreen} options={{ title: 'Trang cá nhân' }} />
      <Stack.Screen
        name="BubblePermissionOnboard"
        component={BubblePermissionOnboardScreen}
        options={{ title: 'Thiết lập bong bóng' }}
      />
      <Stack.Screen
        name="MyDevices"
        component={MyDevicesScreen}
        options={{ title: 'Thiết bị đăng nhập' }}
      />
      <Stack.Screen
        name="WorkTaskList"
        component={WorkTaskListScreen}
        options={{ title: 'Giao công việc' }}
      />
      <Stack.Screen
        name="WorkTaskDetail"
        component={WorkTaskDetailScreen}
        options={{ title: 'Công việc' }}
      />
      <Stack.Screen
        name="WorkTaskForm"
        component={WorkTaskFormScreen}
        options={({ route }) => ({
          title: route.params.mode === 'edit' ? 'Sửa công việc' : 'Giao công việc',
        })}
      />
    </Stack.Navigator>
  );
}

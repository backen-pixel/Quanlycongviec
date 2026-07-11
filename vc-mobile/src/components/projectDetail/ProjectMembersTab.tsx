import Ionicons from '@expo/vector-icons/Ionicons';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {

  ActivityIndicator,

  Alert,

  FlatList,

  Image,

  Modal,

  Pressable,

  RefreshControl,

  StyleSheet,

  Text,

  TouchableOpacity,

  View,

} from 'react-native';

import { formatApiError } from '../../api/client';

import TapHighlight from '../TapHighlight';

import { useTheme } from '../../context/ThemeContext';

import {

  DEAL_MEMBER_ROLES,

  DEAL_MEMBER_ROLE_LABELS,

  removeLeadMember,

  updateLeadMemberRole,

  type DealMemberRole,

} from '../../lib/leadMembersApi';

import { colorFromName, initialsFromName, resolveMediaUrl } from '../../lib/mediaUtils';

import { fetchLeadMembers, type LeadMember } from '../../lib/projectDetailApi';

import type { ProductionProjectDetail } from '../../types';

import { HIT_TARGET, Radii, Spacing, type AppColors } from '../../theme';

import AddDealMembersSheet from './AddDealMembersSheet';



type Props = {

  project: ProductionProjectDetail;

  dealId?: string | null;

};



function PersonAvatar({ name, avatarUrl, size }: {

  name: string;

  avatarUrl?: string | null;

  size: number;

}) {

  const uri = resolveMediaUrl(avatarUrl);

  const bg = colorFromName(name);

  if (uri) {

    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;

  }

  return (

    <View style={{

      width: size,

      height: size,

      borderRadius: size / 2,

      backgroundColor: bg + '33',

      alignItems: 'center',

      justifyContent: 'center',

    }}

    >

      <Text style={{ color: bg, fontSize: size * 0.32, fontWeight: '800' }}>{initialsFromName(name)}</Text>

    </View>

  );

}



export default function ProjectMembersTab({ project, dealId }: Props) {

  const { colors } = useTheme();

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [members, setMembers] = useState<LeadMember[]>([]);

  const [loading, setLoading] = useState(Boolean(dealId));

  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState('');

  const [addSheetOpen, setAddSheetOpen] = useState(false);

  const [roleTarget, setRoleTarget] = useState<LeadMember | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);



  const loadMembers = useCallback(async (silent = false) => {

    if (!dealId) {

      setMembers([]);

      setLoading(false);

      return;

    }

    if (!silent) setLoading(true);

    setError('');

    try {

      setMembers(await fetchLeadMembers(dealId));

    } catch (e) {

      setError(formatApiError(e));

    } finally {

      setLoading(false);

      setRefreshing(false);

    }

  }, [dealId]);



  useEffect(() => {

    void loadMembers(false);

  }, [loadMembers]);



  const existingMemberIds = useMemo(

    () => new Set(members.map((m) => m.user_id).filter(Boolean)),

    [members],

  );



  const handleChangeRole = async (member: LeadMember, role: DealMemberRole) => {

    if (!dealId || !member.user_id) return;

    setRoleTarget(null);

    setActionLoading(member.user_id);

    try {

      await updateLeadMemberRole(dealId, member.user_id, role);

      await loadMembers(true);

    } catch (e) {

      Alert.alert('Lỗi', formatApiError(e));

    } finally {

      setActionLoading(null);

    }

  };



  const confirmRemove = (member: LeadMember) => {

    if (!dealId || !member.user_id) return;

    const name = member.user?.full_name || 'thành viên này';

    Alert.alert('Xóa thành viên', `Xóa ${name} khỏi deal?`, [

      { text: 'Hủy', style: 'cancel' },

      {

        text: 'Xóa',

        style: 'destructive',

        onPress: () => {

          void (async () => {

            setActionLoading(member.user_id);

            try {

              await removeLeadMember(dealId, member.user_id);

              await loadMembers(true);

            } catch (e) {

              Alert.alert('Lỗi', formatApiError(e));

            } finally {

              setActionLoading(null);

            }

          })();

        },

      },

    ]);

  };



  const roleRows = [

    ['Kinh doanh', project.sales_person?.full_name],

    ['QL dự án', project.project_manager?.full_name],

    ['Giám sát', project.supervisor?.full_name],

    ['Vận chuyển (VC)', project.logistics_person?.full_name || project.logistics_person_name],

    ['Lắp đặt (LĐ)', project.installer_person?.full_name || project.installer_person_name],

    ['CSKH', project.care_person?.full_name],

    ['CRM phụ trách', project.crmDeals?.[0]?.assignee?.full_name || project.crmDeals?.[0]?.lead_owner?.full_name],

  ] as const;



  const listHeader = (

    <View>

      <Text style={styles.sectionTitle}>Vai trò dự án</Text>

      <View style={styles.infoCard}>

        {roleRows.map(([label, name]) => (

          <View key={label} style={styles.personRow}>

            <Text style={styles.personLabel}>{label}</Text>

            <Text style={styles.personName}>{name || '— Chưa phân công —'}</Text>

          </View>

        ))}

      </View>



      {dealId ? (

        <>

          <View style={styles.dealHeader}>

            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Thành viên deal</Text>

            <TapHighlight onPress={() => setAddSheetOpen(true)}>

              <View style={styles.addBtn}>

                <Ionicons name="person-add-outline" size={16} color={colors.primary} />

                <Text style={styles.addBtnTxt}>Thêm</Text>

              </View>

            </TapHighlight>

          </View>

          {error && !members.length ? (

            <View style={styles.errorBox}>

              <Text style={styles.errorText}>{error}</Text>

              <TapHighlight onPress={() => void loadMembers()}>

                <Text style={styles.retryTxt}>Thử lại</Text>

              </TapHighlight>

            </View>

          ) : null}

          {loading && !members.length ? (

            <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />

          ) : null}

        </>

      ) : (

        <View style={styles.hintBox}>

          <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />

          <Text style={styles.hintText}>Dự án chưa liên kết deal CRM — chỉ hiển thị vai trò phân công.</Text>

        </View>

      )}

    </View>

  );



  if (!dealId) {

    return (

      <View style={styles.staticPad}>

        {listHeader}

      </View>

    );

  }



  return (

    <>

      <FlatList

        style={{ flex: 1 }}

        data={members}

        keyExtractor={(m, i) => m.user_id || String(i)}

        ListHeaderComponent={listHeader}

        refreshControl={

          <RefreshControl

            refreshing={refreshing}

            onRefresh={() => {

              setRefreshing(true);

              void loadMembers(true);

            }}

            tintColor={colors.primary}

          />

        }

        contentContainerStyle={styles.listPad}

        ListEmptyComponent={

          !loading ? (

            <View style={styles.empty}>

              <Ionicons name="people-outline" size={36} color={colors.textFaint} />

              <Text style={styles.emptyTitle}>Chưa có thành viên deal</Text>

              <TapHighlight onPress={() => setAddSheetOpen(true)}>

                <Text style={styles.emptyAction}>+ Thêm thành viên</Text>

              </TapHighlight>

            </View>

          ) : null

        }

        renderItem={({ item }) => {

          const name = item.user?.full_name || 'Thành viên';

          const roleLabel = DEAL_MEMBER_ROLE_LABELS[String(item.role || '')] || item.role || '';

          const busy = actionLoading === item.user_id;

          return (

            <View style={styles.memberRow}>

              <PersonAvatar name={name} avatarUrl={item.user?.avatar} size={42} />

              <View style={{ flex: 1 }}>

                <Text style={styles.memberName}>{name}</Text>

                {item.user?.email ? <Text style={styles.metaTxt}>{item.user.email}</Text> : null}

                {roleLabel ? (

                  <TapHighlight onPress={() => setRoleTarget(item)} disabled={busy}>

                    <View style={styles.badge}>

                      <Text style={styles.badgeTxt}>{roleLabel}</Text>

                      <Ionicons name="chevron-down" size={12} color={colors.primary} />

                    </View>

                  </TapHighlight>

                ) : null}

              </View>

              {busy ? (

                <ActivityIndicator color={colors.primary} size="small" />

              ) : (

                <TouchableOpacity

                  onPress={() => confirmRemove(item)}

                  hitSlop={8}

                  style={styles.removeBtn}

                >

                  <Ionicons name="trash-outline" size={18} color={colors.danger} />

                </TouchableOpacity>

              )}

            </View>

          );

        }}

      />



      {dealId ? (

        <AddDealMembersSheet

          visible={addSheetOpen}

          dealId={dealId}

          existingMemberIds={existingMemberIds}

          onClose={() => setAddSheetOpen(false)}

          onAdded={() => void loadMembers(true)}

        />

      ) : null}



      <Modal

        visible={Boolean(roleTarget)}

        transparent

        animationType="fade"

        onRequestClose={() => setRoleTarget(null)}

      >

        <Pressable style={styles.roleBackdrop} onPress={() => setRoleTarget(null)}>

          <View style={styles.roleSheet}>

            <Text style={styles.roleTitle}>Đổi vai trò</Text>

            <Text style={styles.roleSub} numberOfLines={1}>

              {roleTarget?.user?.full_name || 'Thành viên'}

            </Text>

            {DEAL_MEMBER_ROLES.map((r) => {

              const active = roleTarget?.role === r.value;

              return (

                <TouchableOpacity

                  key={r.value}

                  style={[styles.roleOption, active && styles.roleOptionActive]}

                  onPress={() => roleTarget && void handleChangeRole(roleTarget, r.value)}

                >

                  <Text style={[styles.roleOptionTxt, active && styles.roleOptionTxtActive]}>

                    {r.label}

                  </Text>

                  {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}

                </TouchableOpacity>

              );

            })}

          </View>

        </Pressable>

      </Modal>

    </>

  );

}



function makeStyles(c: AppColors) {

  return StyleSheet.create({

    staticPad: { padding: Spacing.lg, paddingBottom: Spacing.xl },

    listPad: { padding: Spacing.lg, paddingBottom: Spacing.xl },

    sectionTitle: {

      fontSize: 12,

      fontWeight: '700',

      color: c.textMuted,

      textTransform: 'uppercase',

      marginBottom: 8,

    },

    dealHeader: {

      flexDirection: 'row',

      alignItems: 'center',

      justifyContent: 'space-between',

      marginTop: 16,

      marginBottom: 8,

    },

    addBtn: {

      flexDirection: 'row',

      alignItems: 'center',

      gap: 4,

      paddingHorizontal: 10,

      paddingVertical: 6,

      borderRadius: Radii.md,

      backgroundColor: c.primarySoft,

    },

    addBtnTxt: { fontSize: 13, fontWeight: '700', color: c.primary },

    infoCard: {

      backgroundColor: c.card,

      borderRadius: Radii.lg,

      borderWidth: 1,

      borderColor: c.border,

      padding: 14,

    },

    personRow: {

      flexDirection: 'row',

      alignItems: 'center',

      gap: 10,

      paddingVertical: 8,

      borderBottomWidth: StyleSheet.hairlineWidth,

      borderBottomColor: c.border,

    },

    personLabel: { color: c.textMuted, fontSize: 12, fontWeight: '600', width: 110 },

    personName: { flex: 1, color: c.text, fontSize: 14, fontWeight: '700' },

    memberRow: {

      flexDirection: 'row',

      alignItems: 'center',

      gap: 12,

      backgroundColor: c.card,

      borderRadius: Radii.lg,

      padding: 12,

      marginBottom: 10,

      borderWidth: 1,

      borderColor: c.border,

    },

    memberName: { fontSize: 15, fontWeight: '700', color: c.text },

    metaTxt: { fontSize: 12, color: c.textMuted, marginTop: 2 },

    badge: {

      flexDirection: 'row',

      alignItems: 'center',

      alignSelf: 'flex-start',

      gap: 4,

      paddingHorizontal: 8,

      paddingVertical: 3,

      borderRadius: Radii.sm,

      marginTop: 6,

      backgroundColor: c.primarySoft,

    },

    badgeTxt: { fontSize: 11, fontWeight: '600', color: c.primary },

    removeBtn: {

      width: HIT_TARGET,

      height: HIT_TARGET,

      alignItems: 'center',

      justifyContent: 'center',

    },

    hintBox: {

      flexDirection: 'row',

      alignItems: 'flex-start',

      gap: 8,

      marginTop: 16,

      padding: 12,

      borderRadius: Radii.md,

      backgroundColor: c.cardAlt,

      borderWidth: 1,

      borderColor: c.border,

    },

    hintText: { flex: 1, fontSize: 13, color: c.textMuted, lineHeight: 18 },

    empty: { alignItems: 'center', paddingVertical: 24, gap: 8 },

    emptyTitle: { fontSize: 14, fontWeight: '600', color: c.textMuted },

    emptyAction: { fontSize: 14, fontWeight: '700', color: c.primary, marginTop: 4 },

    errorBox: {

      backgroundColor: c.dangerSoft,

      borderRadius: Radii.md,

      padding: 12,

      marginBottom: 10,

      borderWidth: 1,

      borderColor: c.danger,

    },

    errorText: { color: c.danger, fontSize: 13 },

    retryTxt: { color: c.primary, fontWeight: '600', marginTop: 6 },

    roleBackdrop: {

      flex: 1,

      backgroundColor: 'rgba(0,0,0,0.45)',

      justifyContent: 'center',

      padding: Spacing.lg,

    },

    roleSheet: {

      backgroundColor: c.bgElevated,

      borderRadius: Radii.lg,

      padding: Spacing.lg,

      borderWidth: 1,

      borderColor: c.border,

    },

    roleTitle: { fontSize: 16, fontWeight: '800', color: c.text },

    roleSub: { fontSize: 13, color: c.textMuted, marginTop: 4, marginBottom: 12 },

    roleOption: {

      flexDirection: 'row',

      alignItems: 'center',

      justifyContent: 'space-between',

      paddingVertical: 12,

      borderBottomWidth: StyleSheet.hairlineWidth,

      borderBottomColor: c.border,

    },

    roleOptionActive: { backgroundColor: c.primarySoft + '44' },

    roleOptionTxt: { fontSize: 15, color: c.text, fontWeight: '600' },

    roleOptionTxtActive: { color: c.primary, fontWeight: '800' },

  });

}



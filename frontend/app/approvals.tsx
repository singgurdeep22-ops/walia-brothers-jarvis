import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://smart-store-ai-2.preview.emergentagent.com';

interface ApprovalItem {
  id: string;
  item_type: string;
  customer_name: string;
  customer_phone: string;
  details: any;
  ai_response: string;
  status: string;
  created_at: string;
}

export default function ApprovalsScreen() {
  const router = useRouter();
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [modalVisible, setModalVisible] = useState(false);

  const fetchApprovals = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/approvals`);
      if (response.ok) {
        const data = await response.json();
        setApprovals(data);
      }
    } catch (error) {
      console.log('Fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
    // Poll for new approvals every 30 seconds
    const interval = setInterval(fetchApprovals, 30000);
    return () => clearInterval(interval);
  }, [fetchApprovals]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchApprovals();
  }, [fetchApprovals]);

  const handleApprove = async (item: ApprovalItem, customMsg?: string) => {
    try {
      const url = `${API_URL}/api/approvals/${item.id}/send${customMsg ? `?custom_message=${encodeURIComponent(customMsg)}` : ''}`;
      const response = await fetch(url, { method: 'PUT' });

      if (response.ok) {
        Alert.alert('Approved!', 'Response has been sent to customer.');
        setModalVisible(false);
        setSelectedItem(null);
        setCustomMessage('');
        fetchApprovals();
      } else {
        Alert.alert('Error', 'Failed to approve');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to send approval');
    }
  };

  const handleReject = async (item: ApprovalItem) => {
    Alert.alert(
      'Reject',
      'Are you sure you want to reject this? No response will be sent.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/approvals/${item.id}/reject`, {
                method: 'PUT',
              });
              if (response.ok) {
                fetchApprovals();
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to reject');
            }
          },
        },
      ]
    );
  };

  const handleCallCustomer = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsAppCustomer = (phone: string, message: string) => {
    const encodedMsg = encodeURIComponent(message);
    Linking.openURL(`https://wa.me/91${phone}?text=${encodedMsg}`);
  };

  const openEditModal = (item: ApprovalItem) => {
    setSelectedItem(item);
    setCustomMessage(item.ai_response);
    setModalVisible(true);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'quote':
        return 'pricetag';
      case 'whatsapp_reply':
        return 'logo-whatsapp';
      case 'complaint':
        return 'construct';
      case 'lead':
        return 'person-add';
      default:
        return 'chatbubble';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'quote':
        return '#4CAF50';
      case 'whatsapp_reply':
        return '#25D366';
      case 'complaint':
        return '#FF9800';
      case 'lead':
        return '#2196F3';
      default:
        return '#9C27B0';
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const renderApprovalItem = ({ item }: { item: ApprovalItem }) => (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={[styles.typeIcon, { backgroundColor: getTypeColor(item.item_type) + '20' }]}>
          <Ionicons name={getTypeIcon(item.item_type) as any} size={24} color={getTypeColor(item.item_type)} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.customerName}>{item.customer_name || 'Unknown Customer'}</Text>
          <Text style={styles.customerPhone}>{item.customer_phone}</Text>
        </View>
        <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
      </View>

      {/* Original Message */}
      {item.details?.original_message && (
        <View style={styles.messageBox}>
          <Text style={styles.messageLabel}>Customer said:</Text>
          <Text style={styles.messageText}>"{item.details.original_message}"</Text>
        </View>
      )}

      {/* AI Suggested Response */}
      <View style={styles.aiResponseBox}>
        <View style={styles.aiHeader}>
          <Ionicons name="sparkles" size={16} color="#E91E63" />
          <Text style={styles.aiLabel}>AI Suggested Response:</Text>
        </View>
        <Text style={styles.aiResponse}>{item.ai_response}</Text>
      </View>

      {/* Details */}
      {item.details?.product_mentioned && (
        <View style={styles.detailRow}>
          <Ionicons name="cube" size={16} color="#aaa" />
          <Text style={styles.detailText}>Product: {item.details.product_mentioned}</Text>
        </View>
      )}
      {item.details?.suggested_price && (
        <View style={styles.detailRow}>
          <Ionicons name="pricetag" size={16} color="#4CAF50" />
          <Text style={styles.detailText}>Suggested Price: {item.details.suggested_price}</Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.callButton}
          onPress={() => handleCallCustomer(item.customer_phone)}
        >
          <Ionicons name="call" size={18} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.whatsappButton}
          onPress={() => handleWhatsAppCustomer(item.customer_phone, item.ai_response)}
        >
          <Ionicons name="logo-whatsapp" size={18} color="#fff" />
          <Text style={styles.whatsappText}>Send via WhatsApp</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => openEditModal(item)}
        >
          <Ionicons name="pencil" size={18} color="#2196F3" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.rejectButton}
          onPress={() => handleReject(item)}
        >
          <Ionicons name="close" size={18} color="#f44336" />
        </TouchableOpacity>
      </View>

      {/* Quick Approve */}
      <TouchableOpacity
        style={styles.approveButton}
        onPress={() => handleApprove(item)}
      >
        <Ionicons name="checkmark-circle" size={20} color="#fff" />
        <Text style={styles.approveText}>Approve & Send</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Approval Queue</Text>
          <Text style={styles.headerSubtitle}>
            {approvals.length} pending approval{approvals.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={onRefresh}>
          <Ionicons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="shield-checkmark" size={20} color="#FF9800" />
        <Text style={styles.infoText}>
          Review AI responses before they're sent to customers
        </Text>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      ) : (
        <FlatList
          data={approvals}
          renderItem={renderApprovalItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-done-circle" size={80} color="#4CAF50" />
              <Text style={styles.emptyText}>All caught up!</Text>
              <Text style={styles.emptySubtext}>No pending approvals</Text>
            </View>
          }
        />
      )}

      {/* Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Response</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Customer: {selectedItem?.customer_name}</Text>
              <Text style={styles.originalMessage}>
                Original: "{selectedItem?.details?.original_message}"
              </Text>

              <Text style={styles.inputLabel}>Your Response:</Text>
              <TextInput
                style={styles.textArea}
                value={customMessage}
                onChangeText={setCustomMessage}
                multiline
                placeholder="Edit the response..."
                placeholderTextColor="#666"
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.sendWhatsAppBtn}
                  onPress={() => {
                    if (selectedItem) {
                      handleWhatsAppCustomer(selectedItem.customer_phone, customMessage);
                    }
                  }}
                >
                  <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                  <Text style={styles.sendBtnText}>Send via WhatsApp</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={() => selectedItem && handleApprove(selectedItem, customMessage)}
                >
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.sendBtnText}>Approve</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#16213e' },
  backButton: { padding: 4 },
  headerContent: { flex: 1, marginLeft: 12 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  headerSubtitle: { color: '#FF9800', fontSize: 12, marginTop: 2 },
  infoBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF980015', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  infoText: { flex: 1, color: '#FF9800', fontSize: 13 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContainer: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#16213e', borderRadius: 16, padding: 16, marginBottom: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  typeIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1, marginLeft: 12 },
  customerName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  customerPhone: { color: '#aaa', fontSize: 13, marginTop: 2 },
  timeText: { color: '#666', fontSize: 12 },
  messageBox: { backgroundColor: '#0f3460', borderRadius: 12, padding: 12, marginBottom: 12 },
  messageLabel: { color: '#aaa', fontSize: 12, marginBottom: 4 },
  messageText: { color: '#fff', fontSize: 14, fontStyle: 'italic' },
  aiResponseBox: { backgroundColor: '#E91E6310', borderRadius: 12, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#E91E63' },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  aiLabel: { color: '#E91E63', fontSize: 12, fontWeight: '600' },
  aiResponse: { color: '#fff', fontSize: 14, lineHeight: 20 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  detailText: { color: '#aaa', fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 12 },
  callButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#4CAF50', justifyContent: 'center', alignItems: 'center' },
  whatsappButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#25D366', borderRadius: 20, paddingVertical: 10, gap: 8 },
  whatsappText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  editButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2196F320', justifyContent: 'center', alignItems: 'center' },
  rejectButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f4433620', justifyContent: 'center', alignItems: 'center' },
  approveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4CAF50', borderRadius: 12, paddingVertical: 14, gap: 8 },
  approveText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  emptyContainer: { alignItems: 'center', paddingVertical: 80 },
  emptyText: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginTop: 16 },
  emptySubtext: { color: '#666', fontSize: 16, marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#16213e', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  modalBody: { padding: 20 },
  inputLabel: { color: '#aaa', fontSize: 14, marginBottom: 8 },
  originalMessage: { color: '#888', fontSize: 13, fontStyle: 'italic', marginBottom: 16, backgroundColor: '#0f3460', padding: 12, borderRadius: 8 },
  textArea: { backgroundColor: '#0f3460', borderRadius: 12, padding: 16, color: '#fff', fontSize: 16, minHeight: 120, textAlignVertical: 'top', marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 12 },
  sendWhatsAppBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#25D366', borderRadius: 12, paddingVertical: 14, gap: 8 },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4CAF50', borderRadius: 12, paddingVertical: 14, gap: 8 },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

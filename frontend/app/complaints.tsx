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
  Linking,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Complaint {
  id: string;
  customer_phone: string;
  customer_name: string;
  product_type: string;
  brand: string;
  purchase_date: string;
  product_size: string;
  issue_description: string;
  status: string;
  assigned_to: string;
  remarks: string;
  follow_up_date: string;
}

const STATUS_OPTIONS = ['Pending', 'In Progress', 'Resolved', 'Escalated'];
const STATUS_COLORS: Record<string, string> = {
  'Pending': '#FF9800',
  'In Progress': '#2196F3',
  'Resolved': '#4CAF50',
  'Escalated': '#f44336',
};

const BRANDS = ['LG', 'Samsung', 'Sony', 'Whirlpool', 'Panasonic', 'Haier', 'Lloyd', 'Blue Star', 'Voltas'];
const PRODUCT_TYPES = ['TV', 'AC', 'Refrigerator', 'Washing Machine', 'Microwave', 'Other'];

export default function ComplaintsScreen() {
  const router = useRouter();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    customer_phone: '',
    customer_name: '',
    product_type: '',
    brand: '',
    purchase_date: '',
    product_size: '',
    issue_description: '',
    assigned_to: '',
  });

  const fetchComplaints = useCallback(async () => {
    try {
      let url = `${API_URL}/api/complaints?`;
      if (searchQuery) url += `search=${encodeURIComponent(searchQuery)}&`;
      if (statusFilter) url += `status=${encodeURIComponent(statusFilter)}&`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setComplaints(data);
      }
    } catch (error) {
      console.log('Fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchComplaints();
  }, [fetchComplaints]);

  const handleSaveComplaint = async () => {
    if (!formData.customer_phone || !formData.product_type || !formData.brand || !formData.issue_description) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/complaints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const newComplaint = await response.json();
        setModalVisible(false);
        resetForm();
        fetchComplaints();
        
        // Ask to send to brand WhatsApp
        Alert.alert(
          'Complaint Registered',
          'Do you want to send this complaint to the brand service center via WhatsApp?',
          [
            { text: 'No', style: 'cancel' },
            {
              text: 'Yes, Send',
              onPress: () => handleSendToWhatsApp(newComplaint.id),
            },
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to register complaint');
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to register complaint');
    }
  };

  const handleSendToWhatsApp = async (complaintId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/complaints/${complaintId}/whatsapp-link`);
      if (response.ok) {
        const data = await response.json();
        Linking.openURL(data.whatsapp_link);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to generate WhatsApp link');
    }
  };

  const handleUpdateStatus = async (complaintId: string, newStatus: string) => {
    try {
      const response = await fetch(
        `${API_URL}/api/complaints/${complaintId}?status=${encodeURIComponent(newStatus)}`,
        { method: 'PUT' }
      );
      if (response.ok) {
        fetchComplaints();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const handleDeleteComplaint = async (id: string) => {
    Alert.alert(
      'Delete Complaint',
      'Are you sure you want to delete this complaint?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/complaints/${id}`, {
                method: 'DELETE',
              });
              if (response.ok) {
                fetchComplaints();
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete complaint');
            }
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setFormData({
      customer_phone: '',
      customer_name: '',
      product_type: '',
      brand: '',
      purchase_date: '',
      product_size: '',
      issue_description: '',
      assigned_to: '',
    });
  };

  const renderComplaintItem = ({ item }: { item: Complaint }) => (
    <View style={styles.complaintCard}>
      <View style={styles.complaintHeader}>
        <View style={styles.complaintInfo}>
          <Text style={styles.complaintCustomer}>
            {item.customer_name || item.customer_phone}
          </Text>
          <Text style={styles.complaintPhone}>{item.customer_phone}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] + '30' }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
            {item.status}
          </Text>
        </View>
      </View>

      <View style={styles.complaintDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="tv" size={16} color="#aaa" />
          <Text style={styles.detailText}>{item.product_type} - {item.brand}</Text>
        </View>
        {item.product_size && (
          <View style={styles.detailRow}>
            <Ionicons name="resize" size={16} color="#aaa" />
            <Text style={styles.detailText}>Size: {item.product_size}</Text>
          </View>
        )}
      </View>

      <View style={styles.issueContainer}>
        <Text style={styles.issueLabel}>Issue:</Text>
        <Text style={styles.issueText}>{item.issue_description}</Text>
      </View>

      {item.assigned_to && (
        <View style={styles.assignedContainer}>
          <Ionicons name="person" size={14} color="#4CAF50" />
          <Text style={styles.assignedText}>Assigned to: {item.assigned_to}</Text>
        </View>
      )}

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#25D366' }]}
          onPress={() => handleSendToWhatsApp(item.id)}
        >
          <Ionicons name="logo-whatsapp" size={18} color="#fff" />
        </TouchableOpacity>
        
        <View style={styles.statusActions}>
          {STATUS_OPTIONS.filter(s => s !== item.status).slice(0, 2).map((status) => (
            <TouchableOpacity
              key={status}
              style={[styles.statusButton, { borderColor: STATUS_COLORS[status] }]}
              onPress={() => handleUpdateStatus(item.id, status)}
            >
              <Text style={[styles.statusButtonText, { color: STATUS_COLORS[status] }]}>
                {status}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteComplaint(item.id)}
        >
          <Ionicons name="trash" size={16} color="#f44336" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Complaints</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search complaints..."
          placeholderTextColor="#666"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Status Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterChip, !statusFilter && styles.filterChipActive]}
          onPress={() => setStatusFilter(null)}
        >
          <Text style={[styles.filterChipText, !statusFilter && styles.filterChipTextActive]}>All</Text>
        </TouchableOpacity>
        {STATUS_OPTIONS.map((status) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.filterChip,
              statusFilter === status && styles.filterChipActive,
              { borderColor: STATUS_COLORS[status] },
            ]}
            onPress={() => setStatusFilter(status === statusFilter ? null : status)}
          >
            <Text
              style={[
                styles.filterChipText,
                statusFilter === status && { color: STATUS_COLORS[status] },
              ]}
            >
              {status}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Complaint List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      ) : (
        <FlatList
          data={complaints}
          renderItem={renderComplaintItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="construct-outline" size={64} color="#666" />
              <Text style={styles.emptyText}>No complaints found</Text>
              <Text style={styles.emptySubtext}>Register a new complaint</Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          resetForm();
          setModalVisible(true);
        }}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Register Complaint</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <Text style={styles.inputLabel}>Customer Phone *</Text>
              <TextInput
                style={styles.input}
                placeholder="Phone number"
                placeholderTextColor="#666"
                value={formData.customer_phone}
                onChangeText={(text) => setFormData({ ...formData, customer_phone: text })}
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Customer Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Customer name (optional)"
                placeholderTextColor="#666"
                value={formData.customer_name}
                onChangeText={(text) => setFormData({ ...formData, customer_name: text })}
              />

              <Text style={styles.inputLabel}>Product Type *</Text>
              <View style={styles.optionSelector}>
                {PRODUCT_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.optionButton,
                      formData.product_type === type && styles.optionButtonActive,
                    ]}
                    onPress={() => setFormData({ ...formData, product_type: type })}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        formData.product_type === type && styles.optionButtonTextActive,
                      ]}
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Brand *</Text>
              <View style={styles.optionSelector}>
                {BRANDS.map((brand) => (
                  <TouchableOpacity
                    key={brand}
                    style={[
                      styles.optionButton,
                      formData.brand === brand && styles.optionButtonActive,
                    ]}
                    onPress={() => setFormData({ ...formData, brand })}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        formData.brand === brand && styles.optionButtonTextActive,
                      ]}
                    >
                      {brand}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Product Size</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 55 inch, 1.5 ton"
                placeholderTextColor="#666"
                value={formData.product_size}
                onChangeText={(text) => setFormData({ ...formData, product_size: text })}
              />

              <Text style={styles.inputLabel}>Approximate Purchase Date</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Jan 2024 or 6 months ago"
                placeholderTextColor="#666"
                value={formData.purchase_date}
                onChangeText={(text) => setFormData({ ...formData, purchase_date: text })}
              />

              <Text style={styles.inputLabel}>Issue Description *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Describe the issue in detail"
                placeholderTextColor="#666"
                value={formData.issue_description}
                onChangeText={(text) => setFormData({ ...formData, issue_description: text })}
                multiline
              />

              <TouchableOpacity style={styles.saveButton} onPress={handleSaveComplaint}>
                <Text style={styles.saveButtonText}>Register Complaint</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#16213e',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    padding: 12,
    fontSize: 16,
  },
  filterContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#16213e',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  filterChipActive: {
    backgroundColor: '#FF980030',
    borderColor: '#FF9800',
  },
  filterChipText: {
    color: '#aaa',
    fontSize: 14,
  },
  filterChipTextActive: {
    color: '#FF9800',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  complaintCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  complaintHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  complaintInfo: {
    flex: 1,
  },
  complaintCustomer: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  complaintPhone: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  complaintDetails: {
    marginTop: 12,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    color: '#ddd',
    fontSize: 14,
  },
  issueContainer: {
    marginTop: 12,
    backgroundColor: '#0f3460',
    borderRadius: 8,
    padding: 12,
  },
  issueLabel: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 4,
  },
  issueText: {
    color: '#fff',
    fontSize: 14,
  },
  assignedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  assignedText: {
    color: '#4CAF50',
    fontSize: 12,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusActions: {
    flexDirection: 'row',
    flex: 1,
    gap: 8,
    marginLeft: 8,
  },
  statusButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusButtonText: {
    fontSize: 12,
  },
  deleteButton: {
    padding: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 16,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF9800',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#16213e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  formContainer: {
    padding: 20,
  },
  inputLabel: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0f3460',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  optionSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  optionButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0f3460',
  },
  optionButtonActive: {
    backgroundColor: '#FF9800',
  },
  optionButtonText: {
    color: '#aaa',
    fontSize: 13,
  },
  optionButtonTextActive: {
    color: '#fff',
  },
  saveButton: {
    backgroundColor: '#FF9800',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

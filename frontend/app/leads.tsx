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

interface Lead {
  id: string;
  customer_name: string;
  phone: string;
  city: string;
  product_interested: string;
  model_number: string;
  budget_range: string;
  notes: string;
  status: string;
  follow_up_date: string;
}

const STATUS_OPTIONS = ['New', 'Contacted', 'Closed', 'Not Interested'];
const STATUS_COLORS: Record<string, string> = {
  'New': '#2196F3',
  'Contacted': '#FF9800',
  'Closed': '#4CAF50',
  'Not Interested': '#f44336',
};

export default function LeadsScreen() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    customer_name: '',
    phone: '',
    city: '',
    product_interested: '',
    model_number: '',
    budget_range: '',
    notes: '',
    status: 'New',
    follow_up_date: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    try {
      let url = `${API_URL}/api/leads?`;
      if (searchQuery) url += `search=${encodeURIComponent(searchQuery)}&`;
      if (statusFilter) url += `status=${encodeURIComponent(statusFilter)}&`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setLeads(data);
      }
    } catch (error) {
      console.log('Fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchLeads();
  }, [fetchLeads]);

  const handleSaveLead = async () => {
    if (!formData.customer_name || !formData.phone || !formData.product_interested) {
      Alert.alert('Error', 'Name, phone and product interest are required');
      return;
    }

    try {
      const url = editingId
        ? `${API_URL}/api/leads/${editingId}`
        : `${API_URL}/api/leads`;
      const method = editingId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setModalVisible(false);
        resetForm();
        fetchLeads();
        Alert.alert('Success', `Lead ${editingId ? 'updated' : 'created'} successfully`);
      } else {
        Alert.alert('Error', 'Failed to save lead');
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to save lead');
    }
  };

  const handleDeleteLead = async (id: string) => {
    Alert.alert(
      'Delete Lead',
      'Are you sure you want to delete this lead?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/leads/${id}`, {
                method: 'DELETE',
              });
              if (response.ok) {
                fetchLeads();
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete lead');
            }
          },
        },
      ]
    );
  };

  const handleEditLead = (lead: Lead) => {
    setFormData({
      customer_name: lead.customer_name,
      phone: lead.phone,
      city: lead.city || '',
      product_interested: lead.product_interested,
      model_number: lead.model_number || '',
      budget_range: lead.budget_range || '',
      notes: lead.notes || '',
      status: lead.status,
      follow_up_date: lead.follow_up_date || '',
    });
    setEditingId(lead.id);
    setModalVisible(true);
  };

  const handleCallLead = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsAppLead = (phone: string, name: string, product: string) => {
    const message = `Hi ${name}, this is Walia Brothers Electronics. Following up on your interest in ${product}. How can I help you today?`;
    Linking.openURL(`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`);
  };

  const resetForm = () => {
    setFormData({
      customer_name: '',
      phone: '',
      city: '',
      product_interested: '',
      model_number: '',
      budget_range: '',
      notes: '',
      status: 'New',
      follow_up_date: '',
    });
    setEditingId(null);
  };

  const renderLeadItem = ({ item }: { item: Lead }) => (
    <View style={styles.leadCard}>
      <View style={styles.leadHeader}>
        <View style={styles.leadInfo}>
          <Text style={styles.leadName}>{item.customer_name}</Text>
          <Text style={styles.leadPhone}>{item.phone}</Text>
          {item.city && <Text style={styles.leadCity}>{item.city}</Text>}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] + '30' }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
            {item.status}
          </Text>
        </View>
      </View>

      <View style={styles.leadProduct}>
        <Ionicons name="cart" size={16} color="#4CAF50" />
        <Text style={styles.productText}>{item.product_interested}</Text>
        {item.budget_range && (
          <Text style={styles.budgetText}>Budget: {item.budget_range}</Text>
        )}
      </View>

      {item.follow_up_date && (
        <View style={styles.followUpContainer}>
          <Ionicons name="calendar" size={14} color="#FF9800" />
          <Text style={styles.followUpText}>Follow-up: {item.follow_up_date}</Text>
        </View>
      )}

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#4CAF50' }]}
          onPress={() => handleCallLead(item.phone)}
        >
          <Ionicons name="call" size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#25D366' }]}
          onPress={() => handleWhatsAppLead(item.phone, item.customer_name, item.product_interested)}
        >
          <Ionicons name="logo-whatsapp" size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => handleEditLead(item)}
        >
          <Ionicons name="pencil" size={16} color="#2196F3" />
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteLead(item.id)}
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
        <Text style={styles.headerTitle}>Leads</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search leads..."
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

      {/* Lead List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      ) : (
        <FlatList
          data={leads}
          renderItem={renderLeadItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="trending-up" size={64} color="#666" />
              <Text style={styles.emptyText}>No leads found</Text>
              <Text style={styles.emptySubtext}>Create your first lead</Text>
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

      {/* Add/Edit Modal */}
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
              <Text style={styles.modalTitle}>
                {editingId ? 'Edit Lead' : 'New Lead'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <Text style={styles.inputLabel}>Customer Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Customer name"
                placeholderTextColor="#666"
                value={formData.customer_name}
                onChangeText={(text) => setFormData({ ...formData, customer_name: text })}
              />

              <Text style={styles.inputLabel}>Phone *</Text>
              <TextInput
                style={styles.input}
                placeholder="Phone number"
                placeholderTextColor="#666"
                value={formData.phone}
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>City</Text>
              <TextInput
                style={styles.input}
                placeholder="City/Location"
                placeholderTextColor="#666"
                value={formData.city}
                onChangeText={(text) => setFormData({ ...formData, city: text })}
              />

              <Text style={styles.inputLabel}>Product Interested *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., LED TV, AC, Refrigerator"
                placeholderTextColor="#666"
                value={formData.product_interested}
                onChangeText={(text) => setFormData({ ...formData, product_interested: text })}
              />

              <Text style={styles.inputLabel}>Model Number</Text>
              <TextInput
                style={styles.input}
                placeholder="Model number (optional)"
                placeholderTextColor="#666"
                value={formData.model_number}
                onChangeText={(text) => setFormData({ ...formData, model_number: text })}
              />

              <Text style={styles.inputLabel}>Budget Range</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 30,000 - 50,000"
                placeholderTextColor="#666"
                value={formData.budget_range}
                onChangeText={(text) => setFormData({ ...formData, budget_range: text })}
              />

              <Text style={styles.inputLabel}>Status</Text>
              <View style={styles.statusSelector}>
                {STATUS_OPTIONS.map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.statusOption,
                      formData.status === status && {
                        backgroundColor: STATUS_COLORS[status],
                      },
                    ]}
                    onPress={() => setFormData({ ...formData, status })}
                  >
                    <Text
                      style={[
                        styles.statusOptionText,
                        formData.status === status && { color: '#fff' },
                      ]}
                    >
                      {status}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Follow-up Date</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#666"
                value={formData.follow_up_date}
                onChangeText={(text) => setFormData({ ...formData, follow_up_date: text })}
              />

              <Text style={styles.inputLabel}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Additional notes"
                placeholderTextColor="#666"
                value={formData.notes}
                onChangeText={(text) => setFormData({ ...formData, notes: text })}
                multiline
              />

              <TouchableOpacity style={styles.saveButton} onPress={handleSaveLead}>
                <Text style={styles.saveButtonText}>
                  {editingId ? 'Update Lead' : 'Create Lead'}
                </Text>
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
    backgroundColor: '#4CAF5030',
    borderColor: '#4CAF50',
  },
  filterChipText: {
    color: '#aaa',
    fontSize: 14,
  },
  filterChipTextActive: {
    color: '#4CAF50',
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
  leadCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  leadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  leadInfo: {
    flex: 1,
  },
  leadName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  leadPhone: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 2,
  },
  leadCity: {
    color: '#666',
    fontSize: 12,
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
  leadProduct: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  productText: {
    color: '#4CAF50',
    fontSize: 14,
    marginLeft: 8,
  },
  budgetText: {
    color: '#aaa',
    fontSize: 12,
  },
  followUpContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  followUpText: {
    color: '#FF9800',
    fontSize: 12,
    marginLeft: 6,
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
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    gap: 4,
  },
  editButtonText: {
    color: '#2196F3',
    fontSize: 14,
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
    backgroundColor: '#2196F3',
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
    minHeight: 80,
    textAlignVertical: 'top',
  },
  statusSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  statusOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0f3460',
  },
  statusOptionText: {
    color: '#aaa',
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: '#2196F3',
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

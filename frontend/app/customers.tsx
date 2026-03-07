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
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  purchased_product: string;
  brand: string;
  purchase_date: string;
  notes: string;
  groups: string[];
}

export default function CustomersScreen() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    purchased_product: '',
    brand: '',
    purchase_date: '',
    notes: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchCustomers = useCallback(async () => {
    try {
      const url = searchQuery
        ? `${API_URL}/api/customers?search=${encodeURIComponent(searchQuery)}`
        : `${API_URL}/api/customers`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setCustomers(data);
      }
    } catch (error) {
      console.log('Fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCustomers();
  }, [fetchCustomers]);

  const handleSaveCustomer = async () => {
    if (!formData.name || !formData.phone) {
      Alert.alert('Error', 'Name and phone are required');
      return;
    }

    try {
      const url = editingId
        ? `${API_URL}/api/customers/${editingId}`
        : `${API_URL}/api/customers`;
      const method = editingId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setModalVisible(false);
        resetForm();
        fetchCustomers();
        Alert.alert('Success', `Customer ${editingId ? 'updated' : 'added'} successfully`);
      } else {
        Alert.alert('Error', 'Failed to save customer');
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to save customer');
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    Alert.alert(
      'Delete Customer',
      'Are you sure you want to delete this customer?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/customers/${id}`, {
                method: 'DELETE',
              });
              if (response.ok) {
                fetchCustomers();
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete customer');
            }
          },
        },
      ]
    );
  };

  const handleEditCustomer = (customer: Customer) => {
    setFormData({
      name: customer.name,
      phone: customer.phone,
      address: customer.address || '',
      purchased_product: customer.purchased_product || '',
      brand: customer.brand || '',
      purchase_date: customer.purchase_date || '',
      notes: customer.notes || '',
    });
    setEditingId(customer.id);
    setModalVisible(true);
  };

  const handleCallCustomer = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsAppCustomer = (phone: string, name: string) => {
    const message = `Hi ${name}, this is Walia Brothers Electronics. `;
    Linking.openURL(`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      address: '',
      purchased_product: '',
      brand: '',
      purchase_date: '',
      notes: '',
    });
    setEditingId(null);
  };

  const handleImportExcel = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setImporting(true);
        const file = result.assets[0];
        
        const formData = new FormData();
        formData.append('file', {
          uri: file.uri,
          type: file.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          name: file.name,
        } as any);

        const response = await fetch(`${API_URL}/api/import/customers`, {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();
        
        if (response.ok) {
          Alert.alert(
            'Import Complete',
            `Successfully imported ${data.imported_count} customers.${data.errors?.length ? `\n\nErrors: ${data.errors.length}` : ''}`
          );
          fetchCustomers();
        } else {
          Alert.alert('Import Failed', data.detail || 'Unknown error');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to import file');
    } finally {
      setImporting(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const response = await fetch(`${API_URL}/api/export/customers`);
      
      if (response.ok) {
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result?.toString().split(',')[1];
          if (base64) {
            const fileUri = FileSystem.documentDirectory + 'customers.xlsx';
            await FileSystem.writeAsStringAsync(fileUri, base64, {
              encoding: FileSystem.EncodingType.Base64,
            });
            
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(fileUri);
            } else {
              Alert.alert('Success', 'File saved to ' + fileUri);
            }
          }
        };
        reader.readAsDataURL(blob);
      } else {
        Alert.alert('Error', 'Failed to export customers');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to export file');
    } finally {
      setExporting(false);
    }
  };

  const renderCustomerItem = ({ item }: { item: Customer }) => (
    <View style={styles.customerCard}>
      <View style={styles.customerHeader}>
        <View style={styles.customerInfo}>
          <Text style={styles.customerName}>{item.name}</Text>
          <Text style={styles.customerPhone}>{item.phone}</Text>
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#4CAF50' }]}
            onPress={() => handleCallCustomer(item.phone)}
          >
            <Ionicons name="call" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#25D366' }]}
            onPress={() => handleWhatsAppCustomer(item.phone, item.name)}
          >
            <Ionicons name="logo-whatsapp" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {(item.brand || item.purchased_product) && (
        <View style={styles.customerDetails}>
          {item.brand && (
            <View style={styles.detailChip}>
              <Text style={styles.chipText}>{item.brand}</Text>
            </View>
          )}
          {item.purchased_product && (
            <View style={[styles.detailChip, { backgroundColor: '#2196F320' }]}>
              <Text style={[styles.chipText, { color: '#2196F3' }]}>{item.purchased_product}</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => handleEditCustomer(item)}
        >
          <Ionicons name="pencil" size={16} color="#2196F3" />
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteCustomer(item.id)}
        >
          <Ionicons name="trash" size={16} color="#f44336" />
          <Text style={styles.deleteButtonText}>Delete</Text>
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
        <Text style={styles.headerTitle}>Customers</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleImportExcel}
            disabled={importing}
          >
            {importing ? (
              <ActivityIndicator size="small" color="#4CAF50" />
            ) : (
              <Ionicons name="cloud-upload" size={24} color="#4CAF50" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleExportExcel}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#2196F3" />
            ) : (
              <Ionicons name="cloud-download" size={24} color="#2196F3" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search customers..."
          placeholderTextColor="#666"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Customer List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      ) : (
        <FlatList
          data={customers}
          renderItem={renderCustomerItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color="#666" />
              <Text style={styles.emptyText}>No customers found</Text>
              <Text style={styles.emptySubtext}>Add customers or import from Excel</Text>
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
                {editingId ? 'Edit Customer' : 'Add Customer'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <Text style={styles.inputLabel}>Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Customer name"
                placeholderTextColor="#666"
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
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

              <Text style={styles.inputLabel}>Address</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Address"
                placeholderTextColor="#666"
                value={formData.address}
                onChangeText={(text) => setFormData({ ...formData, address: text })}
                multiline
              />

              <Text style={styles.inputLabel}>Product Purchased</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., LED TV, AC, Refrigerator"
                placeholderTextColor="#666"
                value={formData.purchased_product}
                onChangeText={(text) => setFormData({ ...formData, purchased_product: text })}
              />

              <Text style={styles.inputLabel}>Brand</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., LG, Samsung, Sony"
                placeholderTextColor="#666"
                value={formData.brand}
                onChangeText={(text) => setFormData({ ...formData, brand: text })}
              />

              <Text style={styles.inputLabel}>Purchase Date</Text>
              <TextInput
                style={styles.input}
                placeholder="DD/MM/YYYY"
                placeholderTextColor="#666"
                value={formData.purchase_date}
                onChangeText={(text) => setFormData({ ...formData, purchase_date: text })}
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

              <TouchableOpacity style={styles.saveButton} onPress={handleSaveCustomer}>
                <Text style={styles.saveButtonText}>
                  {editingId ? 'Update Customer' : 'Add Customer'}
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
    justifyContent: 'space-between',
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
    flex: 1,
    marginLeft: 12,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    margin: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    padding: 12,
    fontSize: 16,
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
  customerCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  customerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  customerPhone: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
  },
  detailChip: {
    backgroundColor: '#4CAF5020',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  chipText: {
    color: '#4CAF50',
    fontSize: 12,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    gap: 16,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editButtonText: {
    color: '#2196F3',
    fontSize: 14,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deleteButtonText: {
    color: '#f44336',
    fontSize: 14,
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
    backgroundColor: '#4CAF50',
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
  saveButton: {
    backgroundColor: '#4CAF50',
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

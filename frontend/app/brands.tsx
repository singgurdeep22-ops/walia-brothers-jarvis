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
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://smart-store-ai-2.preview.emergentagent.com';

interface BrandWhatsApp {
  id: string;
  brand_name: string;
  whatsapp_number: string;
  description: string;
}

export default function BrandsScreen() {
  const router = useRouter();
  const [brands, setBrands] = useState<BrandWhatsApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBrand, setEditingBrand] = useState<BrandWhatsApp | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    brand_name: '',
    whatsapp_number: '',
    description: '',
  });

  const fetchBrands = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/brands`);
      if (response.ok) {
        const data = await response.json();
        setBrands(data);
      }
    } catch (error) {
      console.log('Fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBrands();
  }, [fetchBrands]);

  const handleSaveBrand = async () => {
    if (!formData.brand_name || !formData.whatsapp_number) {
      Alert.alert('Error', 'Brand name and WhatsApp number are required');
      return;
    }

    // Validate phone number (10 digits)
    const cleanNumber = formData.whatsapp_number.replace(/[^\d]/g, '');
    if (cleanNumber.length < 10) {
      Alert.alert('Error', 'Please enter a valid 10-digit WhatsApp number');
      return;
    }

    try {
      let response;
      if (editingBrand) {
        // Update existing brand
        response = await fetch(
          `${API_URL}/api/brands/${editingBrand.id}?whatsapp_number=${cleanNumber}&description=${encodeURIComponent(formData.description)}`,
          { method: 'PUT' }
        );
      } else {
        // Create new brand
        response = await fetch(`${API_URL}/api/brands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand_name: formData.brand_name,
            whatsapp_number: cleanNumber,
            description: formData.description,
          }),
        });
      }

      if (response.ok) {
        setModalVisible(false);
        resetForm();
        fetchBrands();
        Alert.alert('Success', `Brand ${editingBrand ? 'updated' : 'added'} successfully`);
      } else {
        const errorData = await response.json();
        Alert.alert('Error', errorData.detail || 'Failed to save brand');
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to save brand');
    }
  };

  const handleEditBrand = (brand: BrandWhatsApp) => {
    setFormData({
      brand_name: brand.brand_name,
      whatsapp_number: brand.whatsapp_number,
      description: brand.description || '',
    });
    setEditingBrand(brand);
    setModalVisible(true);
  };

  const handleDeleteBrand = async (id: string, brandName: string) => {
    Alert.alert(
      'Delete Brand',
      `Are you sure you want to delete ${brandName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/brands/${id}`, {
                method: 'DELETE',
              });
              if (response.ok) {
                fetchBrands();
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete brand');
            }
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setFormData({
      brand_name: '',
      whatsapp_number: '',
      description: '',
    });
    setEditingBrand(null);
  };

  const formatPhoneDisplay = (phone: string) => {
    if (phone.length === 10) {
      return `${phone.slice(0, 5)}-${phone.slice(5)}`;
    }
    return phone;
  };

  const renderBrandItem = ({ item }: { item: BrandWhatsApp }) => (
    <View style={styles.brandCard}>
      <View style={styles.brandHeader}>
        <View style={styles.brandIcon}>
          <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
        </View>
        <View style={styles.brandInfo}>
          <Text style={styles.brandName}>{item.brand_name}</Text>
          <Text style={styles.brandNumber}>+91 {formatPhoneDisplay(item.whatsapp_number)}</Text>
          {item.description && (
            <Text style={styles.brandDescription}>{item.description}</Text>
          )}
        </View>
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => handleEditBrand(item)}
        >
          <Ionicons name="pencil" size={16} color="#2196F3" />
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteBrand(item.id, item.brand_name)}
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
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Brand WhatsApp Numbers</Text>
          <Text style={styles.headerSubtitle}>Manage service center contacts</Text>
        </View>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={20} color="#2196F3" />
        <Text style={styles.infoText}>
          Add WhatsApp numbers of brand service centers to send complaints directly.
        </Text>
      </View>

      {/* Brand List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#25D366" />
        </View>
      ) : (
        <FlatList
          data={brands}
          renderItem={renderBrandItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#25D366" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="business-outline" size={64} color="#666" />
              <Text style={styles.emptyText}>No brands added</Text>
              <Text style={styles.emptySubtext}>Add brand WhatsApp numbers to send complaints</Text>
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
                {editingBrand ? 'Edit Brand' : 'Add Brand'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <Text style={styles.inputLabel}>Brand Name *</Text>
              <TextInput
                style={[styles.input, editingBrand && styles.inputDisabled]}
                placeholder="e.g., LG, Samsung, Sony"
                placeholderTextColor="#666"
                value={formData.brand_name}
                onChangeText={(text) => setFormData({ ...formData, brand_name: text })}
                editable={!editingBrand}
              />

              <Text style={styles.inputLabel}>WhatsApp Number *</Text>
              <View style={styles.phoneInputContainer}>
                <Text style={styles.phonePrefix}>+91</Text>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="9876543210"
                  placeholderTextColor="#666"
                  value={formData.whatsapp_number}
                  onChangeText={(text) => setFormData({ ...formData, whatsapp_number: text.replace(/[^\d]/g, '') })}
                  keyboardType="phone-pad"
                  maxLength={10}
                />
              </View>

              <Text style={styles.inputLabel}>Description (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="e.g., Official service center number"
                placeholderTextColor="#666"
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                multiline
              />

              <TouchableOpacity style={styles.saveButton} onPress={handleSaveBrand}>
                <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                <Text style={styles.saveButtonText}>
                  {editingBrand ? 'Update Brand' : 'Add Brand'}
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
  headerContent: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#25D366',
    fontSize: 12,
    marginTop: 2,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F320',
    margin: 16,
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  infoText: {
    flex: 1,
    color: '#2196F3',
    fontSize: 13,
    lineHeight: 18,
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
  brandCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#25D36620',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  brandInfo: {
    flex: 1,
  },
  brandName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  brandNumber: {
    color: '#25D366',
    fontSize: 14,
    marginTop: 4,
  },
  brandDescription: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 4,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
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
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#25D366',
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
    maxHeight: '80%',
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
  inputDisabled: {
    opacity: 0.6,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f3460',
    borderRadius: 12,
    marginBottom: 16,
  },
  phonePrefix: {
    color: '#25D366',
    fontSize: 16,
    fontWeight: 'bold',
    paddingLeft: 16,
    paddingRight: 8,
  },
  phoneInput: {
    flex: 1,
    padding: 16,
    paddingLeft: 0,
    color: '#fff',
    fontSize: 16,
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#25D366',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 32,
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://smart-store-ai-2.preview.emergentagent.com';

interface Product {
  id: string;
  name: string;
  category: string;
  brand: string;
  model_number: string;
  base_price: number;
  min_price: number;
  max_discount_percent: number;
  features: string;
  in_stock: boolean;
}

interface StoreInfo {
  id: string;
  info_type: string;
  title: string;
  content: string;
  is_active: boolean;
}

interface WorkflowRule {
  id: string;
  rule_name: string;
  trigger: string;
  action: string;
  response_template: string;
  requires_approval: boolean;
  is_active: boolean;
}

type TabType = 'products' | 'info' | 'workflow';

const CATEGORIES = ['TV', 'AC', 'Refrigerator', 'Washing Machine', 'Microwave', 'Other'];
const INFO_TYPES = [
  { value: 'delivery_area', label: 'Delivery Areas' },
  { value: 'payment_option', label: 'Payment Options' },
  { value: 'warranty', label: 'Warranty Info' },
  { value: 'faq', label: 'FAQ' },
  { value: 'greeting', label: 'Greetings' },
];

export default function AITrainingScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('products');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [storeInfo, setStoreInfo] = useState<StoreInfo[]>([]);
  const [workflowRules, setWorkflowRules] = useState<WorkflowRule[]>([]);
  
  // Modals
  const [productModal, setProductModal] = useState(false);
  const [infoModal, setInfoModal] = useState(false);
  const [workflowModal, setWorkflowModal] = useState(false);
  
  // Forms
  const [productForm, setProductForm] = useState({
    name: '',
    category: 'TV',
    brand: '',
    model_number: '',
    base_price: '',
    min_price: '',
    max_discount_percent: '10',
    features: '',
    in_stock: true,
  });
  
  const [infoForm, setInfoForm] = useState({
    info_type: 'delivery_area',
    title: '',
    content: '',
  });
  
  const [workflowForm, setWorkflowForm] = useState({
    rule_name: '',
    trigger: '',
    action: '',
    response_template: '',
    requires_approval: true,
  });
  
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [productsRes, infoRes, rulesRes] = await Promise.all([
        fetch(`${API_URL}/api/products`),
        fetch(`${API_URL}/api/store-info`),
        fetch(`${API_URL}/api/workflow-rules`),
      ]);

      if (productsRes.ok) {
        setProducts(await productsRes.json());
      }
      if (infoRes.ok) {
        setStoreInfo(await infoRes.json());
      }
      if (rulesRes.ok) {
        setWorkflowRules(await rulesRes.json());
      }
    } catch (error) {
      console.log('Fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  // Product handlers
  const handleSaveProduct = async () => {
    if (!productForm.name || !productForm.brand || !productForm.base_price) {
      Alert.alert('Error', 'Name, brand and base price are required');
      return;
    }

    try {
      const payload = {
        ...productForm,
        base_price: parseFloat(productForm.base_price),
        min_price: parseFloat(productForm.min_price || productForm.base_price),
        max_discount_percent: parseFloat(productForm.max_discount_percent || '10'),
      };

      const url = editingId ? `${API_URL}/api/products/${editingId}` : `${API_URL}/api/products`;
      const method = editingId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setProductModal(false);
        resetProductForm();
        fetchData();
        Alert.alert('Success', `Product ${editingId ? 'updated' : 'added'}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save product');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    Alert.alert('Delete Product', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await fetch(`${API_URL}/api/products/${id}`, { method: 'DELETE' });
            fetchData();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete');
          }
        },
      },
    ]);
  };

  const resetProductForm = () => {
    setProductForm({
      name: '',
      category: 'TV',
      brand: '',
      model_number: '',
      base_price: '',
      min_price: '',
      max_discount_percent: '10',
      features: '',
      in_stock: true,
    });
    setEditingId(null);
  };

  // Store Info handlers
  const handleSaveInfo = async () => {
    if (!infoForm.title || !infoForm.content) {
      Alert.alert('Error', 'Title and content are required');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/store-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(infoForm),
      });

      if (response.ok) {
        setInfoModal(false);
        setInfoForm({ info_type: 'delivery_area', title: '', content: '' });
        fetchData();
        Alert.alert('Success', 'Info added');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save info');
    }
  };

  const handleDeleteInfo = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/store-info/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (error) {
      Alert.alert('Error', 'Failed to delete');
    }
  };

  // Workflow handlers
  const handleSaveWorkflow = async () => {
    if (!workflowForm.rule_name || !workflowForm.trigger) {
      Alert.alert('Error', 'Rule name and trigger are required');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/workflow-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflowForm),
      });

      if (response.ok) {
        setWorkflowModal(false);
        setWorkflowForm({ rule_name: '', trigger: '', action: '', response_template: '', requires_approval: true });
        fetchData();
        Alert.alert('Success', 'Workflow rule added');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save rule');
    }
  };

  const handleDeleteWorkflow = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/workflow-rules/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (error) {
      Alert.alert('Error', 'Failed to delete');
    }
  };

  const formatPrice = (price: number) => {
    return '₹' + price.toLocaleString('en-IN');
  };

  const renderProducts = () => (
    <ScrollView style={styles.tabContent}>
      {products.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="cube-outline" size={64} color="#666" />
          <Text style={styles.emptyText}>No products added</Text>
          <Text style={styles.emptySubtext}>Add products so AI knows your inventory</Text>
        </View>
      ) : (
        products.map((product) => (
          <View key={product.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>{product.name}</Text>
                <Text style={styles.cardSubtitle}>{product.brand} - {product.category}</Text>
              </View>
              <View style={[styles.stockBadge, { backgroundColor: product.in_stock ? '#4CAF5030' : '#f4433630' }]}>
                <Text style={[styles.stockText, { color: product.in_stock ? '#4CAF50' : '#f44336' }]}>
                  {product.in_stock ? 'In Stock' : 'Out of Stock'}
                </Text>
              </View>
            </View>
            
            <View style={styles.priceRow}>
              <View>
                <Text style={styles.priceLabel}>Base Price</Text>
                <Text style={styles.priceValue}>{formatPrice(product.base_price)}</Text>
              </View>
              <View>
                <Text style={styles.priceLabel}>Min Price</Text>
                <Text style={styles.priceValue}>{formatPrice(product.min_price)}</Text>
              </View>
              <View>
                <Text style={styles.priceLabel}>Max Discount</Text>
                <Text style={styles.priceValue}>{product.max_discount_percent}%</Text>
              </View>
            </View>
            
            {product.features && (
              <Text style={styles.features}>{product.features}</Text>
            )}
            
            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteProduct(product.id)}>
              <Ionicons name="trash" size={16} color="#f44336" />
              <Text style={styles.deleteBtnText}>Delete</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );

  const renderStoreInfo = () => (
    <ScrollView style={styles.tabContent}>
      {INFO_TYPES.map((type) => {
        const items = storeInfo.filter(i => i.info_type === type.value);
        return (
          <View key={type.value} style={styles.infoSection}>
            <Text style={styles.sectionTitle}>{type.label}</Text>
            {items.length === 0 ? (
              <Text style={styles.noItems}>No items added</Text>
            ) : (
              items.map((item) => (
                <View key={item.id} style={styles.infoCard}>
                  <View style={styles.infoContent}>
                    <Text style={styles.infoTitle}>{item.title}</Text>
                    <Text style={styles.infoText}>{item.content}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteInfo(item.id)}>
                    <Ionicons name="close-circle" size={24} color="#f44336" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        );
      })}
    </ScrollView>
  );

  const renderWorkflow = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.workflowInfo}>
        <Ionicons name="information-circle" size={20} color="#2196F3" />
        <Text style={styles.workflowInfoText}>
          Workflow rules define how AI should respond and when to ask for your approval.
        </Text>
      </View>
      
      {workflowRules.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="git-branch-outline" size={64} color="#666" />
          <Text style={styles.emptyText}>No workflow rules</Text>
          <Text style={styles.emptySubtext}>Add rules to control AI behavior</Text>
        </View>
      ) : (
        workflowRules.map((rule) => (
          <View key={rule.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{rule.rule_name}</Text>
              <View style={[styles.approvalBadge, { backgroundColor: rule.requires_approval ? '#FF980030' : '#4CAF5030' }]}>
                <Text style={[styles.approvalText, { color: rule.requires_approval ? '#FF9800' : '#4CAF50' }]}>
                  {rule.requires_approval ? 'Needs Approval' : 'Auto'}
                </Text>
              </View>
            </View>
            <Text style={styles.ruleText}>Trigger: {rule.trigger}</Text>
            <Text style={styles.ruleText}>Action: {rule.action}</Text>
            {rule.response_template && (
              <Text style={styles.templateText}>Template: {rule.response_template}</Text>
            )}
            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteWorkflow(rule.id)}>
              <Ionicons name="trash" size={16} color="#f44336" />
              <Text style={styles.deleteBtnText}>Delete</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>AI Training</Text>
          <Text style={styles.headerSubtitle}>Teach Jarvis about your store</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'products' && styles.tabActive]}
          onPress={() => setActiveTab('products')}
        >
          <Ionicons name="cube" size={20} color={activeTab === 'products' ? '#4CAF50' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'products' && styles.tabTextActive]}>Products</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'info' && styles.tabActive]}
          onPress={() => setActiveTab('info')}
        >
          <Ionicons name="information-circle" size={20} color={activeTab === 'info' ? '#4CAF50' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'info' && styles.tabTextActive]}>Store Info</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'workflow' && styles.tabActive]}
          onPress={() => setActiveTab('workflow')}
        >
          <Ionicons name="git-branch" size={20} color={activeTab === 'workflow' ? '#4CAF50' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'workflow' && styles.tabTextActive]}>Workflow</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'products' && renderProducts()}
      {activeTab === 'info' && renderStoreInfo()}
      {activeTab === 'workflow' && renderWorkflow()}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          if (activeTab === 'products') {
            resetProductForm();
            setProductModal(true);
          } else if (activeTab === 'info') {
            setInfoModal(true);
          } else {
            setWorkflowModal(true);
          }
        }}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Product Modal */}
      <Modal visible={productModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Product</Text>
              <TouchableOpacity onPress={() => setProductModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Product Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 55 inch Smart TV"
                placeholderTextColor="#666"
                value={productForm.name}
                onChangeText={(t) => setProductForm({...productForm, name: t})}
              />

              <Text style={styles.inputLabel}>Category *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryChip, productForm.category === cat && styles.categoryChipActive]}
                    onPress={() => setProductForm({...productForm, category: cat})}
                  >
                    <Text style={[styles.categoryText, productForm.category === cat && styles.categoryTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.inputLabel}>Brand *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., LG, Samsung"
                placeholderTextColor="#666"
                value={productForm.brand}
                onChangeText={(t) => setProductForm({...productForm, brand: t})}
              />

              <Text style={styles.inputLabel}>Model Number</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 55UP7500"
                placeholderTextColor="#666"
                value={productForm.model_number}
                onChangeText={(t) => setProductForm({...productForm, model_number: t})}
              />

              <View style={styles.priceInputRow}>
                <View style={styles.priceInputGroup}>
                  <Text style={styles.inputLabel}>Base Price (₹) *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="50000"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                    value={productForm.base_price}
                    onChangeText={(t) => setProductForm({...productForm, base_price: t})}
                  />
                </View>
                <View style={styles.priceInputGroup}>
                  <Text style={styles.inputLabel}>Min Price (₹)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="45000"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                    value={productForm.min_price}
                    onChangeText={(t) => setProductForm({...productForm, min_price: t})}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Max Discount %</Text>
              <TextInput
                style={styles.input}
                placeholder="10"
                placeholderTextColor="#666"
                keyboardType="numeric"
                value={productForm.max_discount_percent}
                onChangeText={(t) => setProductForm({...productForm, max_discount_percent: t})}
              />

              <Text style={styles.inputLabel}>Features</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="4K, Smart TV, WebOS, Magic Remote..."
                placeholderTextColor="#666"
                multiline
                value={productForm.features}
                onChangeText={(t) => setProductForm({...productForm, features: t})}
              />

              <TouchableOpacity
                style={[styles.stockToggle, productForm.in_stock && styles.stockToggleActive]}
                onPress={() => setProductForm({...productForm, in_stock: !productForm.in_stock})}
              >
                <Ionicons name={productForm.in_stock ? 'checkbox' : 'square-outline'} size={24} color={productForm.in_stock ? '#4CAF50' : '#666'} />
                <Text style={styles.stockToggleText}>In Stock</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveButton} onPress={handleSaveProduct}>
                <Text style={styles.saveButtonText}>Save Product</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Info Modal */}
      <Modal visible={infoModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Store Info</Text>
              <TouchableOpacity onPress={() => setInfoModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Info Type</Text>
              <View style={styles.infoTypeGrid}>
                {INFO_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type.value}
                    style={[styles.infoTypeChip, infoForm.info_type === type.value && styles.infoTypeChipActive]}
                    onPress={() => setInfoForm({...infoForm, info_type: type.value})}
                  >
                    <Text style={[styles.infoTypeText, infoForm.info_type === type.value && styles.infoTypeTextActive]}>
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Free Delivery, EMI Options"
                placeholderTextColor="#666"
                value={infoForm.title}
                onChangeText={(t) => setInfoForm({...infoForm, title: t})}
              />

              <Text style={styles.inputLabel}>Content *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Describe in detail..."
                placeholderTextColor="#666"
                multiline
                value={infoForm.content}
                onChangeText={(t) => setInfoForm({...infoForm, content: t})}
              />

              <TouchableOpacity style={styles.saveButton} onPress={handleSaveInfo}>
                <Text style={styles.saveButtonText}>Save Info</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Workflow Modal */}
      <Modal visible={workflowModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Workflow Rule</Text>
              <TouchableOpacity onPress={() => setWorkflowModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Rule Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Price Quote Approval"
                placeholderTextColor="#666"
                value={workflowForm.rule_name}
                onChangeText={(t) => setWorkflowForm({...workflowForm, rule_name: t})}
              />

              <Text style={styles.inputLabel}>Trigger (When should this rule apply?) *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., customer asks for price"
                placeholderTextColor="#666"
                value={workflowForm.trigger}
                onChangeText={(t) => setWorkflowForm({...workflowForm, trigger: t})}
              />

              <Text style={styles.inputLabel}>Action</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., create_quote, send_approval"
                placeholderTextColor="#666"
                value={workflowForm.action}
                onChangeText={(t) => setWorkflowForm({...workflowForm, action: t})}
              />

              <Text style={styles.inputLabel}>Response Template</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="AI response when this rule triggers..."
                placeholderTextColor="#666"
                multiline
                value={workflowForm.response_template}
                onChangeText={(t) => setWorkflowForm({...workflowForm, response_template: t})}
              />

              <TouchableOpacity
                style={[styles.stockToggle, workflowForm.requires_approval && styles.stockToggleActive]}
                onPress={() => setWorkflowForm({...workflowForm, requires_approval: !workflowForm.requires_approval})}
              >
                <Ionicons name={workflowForm.requires_approval ? 'checkbox' : 'square-outline'} size={24} color={workflowForm.requires_approval ? '#FF9800' : '#666'} />
                <Text style={styles.stockToggleText}>Requires Your Approval</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveButton} onPress={handleSaveWorkflow}>
                <Text style={styles.saveButtonText}>Save Rule</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#16213e' },
  backButton: { padding: 4 },
  headerContent: { flex: 1, marginLeft: 12 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  headerSubtitle: { color: '#4CAF50', fontSize: 12, marginTop: 2 },
  tabBar: { flexDirection: 'row', backgroundColor: '#16213e', marginHorizontal: 16, marginTop: 16, borderRadius: 12, padding: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 8, gap: 6 },
  tabActive: { backgroundColor: '#4CAF5020' },
  tabText: { color: '#666', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#4CAF50' },
  tabContent: { flex: 1, padding: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 64 },
  emptyText: { color: '#fff', fontSize: 18, marginTop: 16 },
  emptySubtext: { color: '#666', fontSize: 14, marginTop: 8 },
  card: { backgroundColor: '#16213e', borderRadius: 12, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cardSubtitle: { color: '#aaa', fontSize: 13, marginTop: 2 },
  stockBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  stockText: { fontSize: 11, fontWeight: '600' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, backgroundColor: '#0f3460', borderRadius: 8, padding: 12 },
  priceLabel: { color: '#aaa', fontSize: 11 },
  priceValue: { color: '#4CAF50', fontSize: 16, fontWeight: 'bold', marginTop: 2 },
  features: { color: '#aaa', fontSize: 12, marginTop: 12 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 12, gap: 4 },
  deleteBtnText: { color: '#f44336', fontSize: 14 },
  infoSection: { marginBottom: 24 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  noItems: { color: '#666', fontSize: 14, fontStyle: 'italic' },
  infoCard: { flexDirection: 'row', backgroundColor: '#16213e', borderRadius: 12, padding: 14, marginBottom: 8, alignItems: 'center' },
  infoContent: { flex: 1 },
  infoTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  infoText: { color: '#aaa', fontSize: 13, marginTop: 4 },
  workflowInfo: { flexDirection: 'row', backgroundColor: '#2196F320', borderRadius: 12, padding: 12, marginBottom: 16, gap: 10 },
  workflowInfoText: { flex: 1, color: '#2196F3', fontSize: 13 },
  approvalBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  approvalText: { fontSize: 11, fontWeight: '600' },
  ruleText: { color: '#aaa', fontSize: 13, marginTop: 8 },
  templateText: { color: '#666', fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4CAF50', justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#16213e', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  modalBody: { padding: 20 },
  inputLabel: { color: '#aaa', fontSize: 14, marginBottom: 8 },
  input: { backgroundColor: '#0f3460', borderRadius: 12, padding: 14, color: '#fff', fontSize: 16, marginBottom: 16 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  categoryScroll: { marginBottom: 16 },
  categoryChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#0f3460', marginRight: 8 },
  categoryChipActive: { backgroundColor: '#4CAF50' },
  categoryText: { color: '#aaa', fontSize: 14 },
  categoryTextActive: { color: '#fff' },
  priceInputRow: { flexDirection: 'row', gap: 12 },
  priceInputGroup: { flex: 1 },
  stockToggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f3460', borderRadius: 12, padding: 14, marginBottom: 16, gap: 12 },
  stockToggleActive: { backgroundColor: '#4CAF5020' },
  stockToggleText: { color: '#fff', fontSize: 16 },
  infoTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  infoTypeChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: '#0f3460' },
  infoTypeChipActive: { backgroundColor: '#4CAF50' },
  infoTypeText: { color: '#aaa', fontSize: 13 },
  infoTypeTextActive: { color: '#fff' },
  saveButton: { backgroundColor: '#4CAF50', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 32 },
  saveButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});

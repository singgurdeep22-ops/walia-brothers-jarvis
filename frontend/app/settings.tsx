import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface StaffMember {
  id: string;
  name: string;
  phone: string;
  role: string;
}

export default function SettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [showPinChange, setShowPinChange] = useState(false);
  const [showStaffForm, setShowStaffForm] = useState(false);

  // Settings
  const [settings, setSettings] = useState({
    store_name: 'Walia Brothers',
    store_phone: '',
    store_address: '',
  });

  // PIN change
  const [pinData, setPinData] = useState({
    old_pin: '',
    new_pin: '',
    confirm_pin: '',
  });

  // Staff form
  const [staffForm, setStaffForm] = useState({
    name: '',
    phone: '',
    role: 'Technician',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [settingsRes, staffRes] = await Promise.all([
        fetch(`${API_URL}/api/settings`),
        fetch(`${API_URL}/api/staff`),
      ]);

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setSettings({
          store_name: data.store_name || 'Walia Brothers',
          store_phone: data.store_phone || '',
          store_address: data.store_address || '',
        });
      }

      if (staffRes.ok) {
        const data = await staffRes.json();
        setStaff(data);
      }
    } catch (error) {
      console.log('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const params = new URLSearchParams();
      if (settings.store_name) params.append('store_name', settings.store_name);
      if (settings.store_phone) params.append('store_phone', settings.store_phone);
      if (settings.store_address) params.append('store_address', settings.store_address);

      const response = await fetch(`${API_URL}/api/settings?${params.toString()}`, {
        method: 'PUT',
      });

      if (response.ok) {
        Alert.alert('Success', 'Settings saved successfully');
      } else {
        Alert.alert('Error', 'Failed to save settings');
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to save settings');
    }
  };

  const handleChangePin = async () => {
    if (pinData.new_pin !== pinData.confirm_pin) {
      Alert.alert('Error', 'New PIN and confirm PIN do not match');
      return;
    }

    if (pinData.new_pin.length < 4) {
      Alert.alert('Error', 'PIN must be at least 4 digits');
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/auth/change-pin?old_pin=${pinData.old_pin}&new_pin=${pinData.new_pin}`,
        { method: 'POST' }
      );

      if (response.ok) {
        Alert.alert('Success', 'PIN changed successfully');
        setShowPinChange(false);
        setPinData({ old_pin: '', new_pin: '', confirm_pin: '' });
      } else {
        Alert.alert('Error', 'Invalid current PIN');
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to change PIN');
    }
  };

  const handleAddStaff = async () => {
    if (!staffForm.name) {
      Alert.alert('Error', 'Staff name is required');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staffForm),
      });

      if (response.ok) {
        setShowStaffForm(false);
        setStaffForm({ name: '', phone: '', role: 'Technician' });
        fetchData();
        Alert.alert('Success', 'Staff member added');
      } else {
        Alert.alert('Error', 'Failed to add staff');
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to add staff');
    }
  };

  const handleDeleteStaff = async (id: string) => {
    Alert.alert(
      'Delete Staff',
      'Are you sure you want to delete this staff member?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/staff/${id}`, {
                method: 'DELETE',
              });
              if (response.ok) {
                fetchData();
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete staff');
            }
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('isLoggedIn');
            router.replace('/');
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#607D8B" />
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
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Store Settings */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Store Settings</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Store Name</Text>
              <TextInput
                style={styles.input}
                value={settings.store_name}
                onChangeText={(text) => setSettings({ ...settings, store_name: text })}
                placeholder="Store name"
                placeholderTextColor="#666"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Store Phone</Text>
              <TextInput
                style={styles.input}
                value={settings.store_phone}
                onChangeText={(text) => setSettings({ ...settings, store_phone: text })}
                placeholder="Store phone number"
                placeholderTextColor="#666"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Store Address</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={settings.store_address}
                onChangeText={(text) => setSettings({ ...settings, store_address: text })}
                placeholder="Store address"
                placeholderTextColor="#666"
                multiline
              />
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleSaveSettings}>
              <Text style={styles.saveButtonText}>Save Settings</Text>
            </TouchableOpacity>
          </View>

          {/* Security */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Security</Text>
            
            {!showPinChange ? (
              <TouchableOpacity
                style={styles.optionButton}
                onPress={() => setShowPinChange(true)}
              >
                <Ionicons name="lock-closed" size={24} color="#607D8B" />
                <Text style={styles.optionText}>Change PIN</Text>
                <Ionicons name="chevron-forward" size={20} color="#666" />
              </TouchableOpacity>
            ) : (
              <View style={styles.pinChangeContainer}>
                <TextInput
                  style={styles.input}
                  value={pinData.old_pin}
                  onChangeText={(text) => setPinData({ ...pinData, old_pin: text })}
                  placeholder="Current PIN"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                  secureTextEntry
                  maxLength={6}
                />
                <TextInput
                  style={styles.input}
                  value={pinData.new_pin}
                  onChangeText={(text) => setPinData({ ...pinData, new_pin: text })}
                  placeholder="New PIN"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                  secureTextEntry
                  maxLength={6}
                />
                <TextInput
                  style={styles.input}
                  value={pinData.confirm_pin}
                  onChangeText={(text) => setPinData({ ...pinData, confirm_pin: text })}
                  placeholder="Confirm New PIN"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                  secureTextEntry
                  maxLength={6}
                />
                <View style={styles.pinActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setShowPinChange(false);
                      setPinData({ old_pin: '', new_pin: '', confirm_pin: '' });
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmButton} onPress={handleChangePin}>
                    <Text style={styles.confirmButtonText}>Change PIN</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Staff Management */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Staff / Technicians</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowStaffForm(!showStaffForm)}
              >
                <Ionicons name={showStaffForm ? 'close' : 'add'} size={24} color="#4CAF50" />
              </TouchableOpacity>
            </View>

            {showStaffForm && (
              <View style={styles.staffFormContainer}>
                <TextInput
                  style={styles.input}
                  value={staffForm.name}
                  onChangeText={(text) => setStaffForm({ ...staffForm, name: text })}
                  placeholder="Staff name"
                  placeholderTextColor="#666"
                />
                <TextInput
                  style={styles.input}
                  value={staffForm.phone}
                  onChangeText={(text) => setStaffForm({ ...staffForm, phone: text })}
                  placeholder="Phone number (optional)"
                  placeholderTextColor="#666"
                  keyboardType="phone-pad"
                />
                <View style={styles.roleSelector}>
                  {['Technician', 'Sales', 'Manager'].map((role) => (
                    <TouchableOpacity
                      key={role}
                      style={[
                        styles.roleOption,
                        staffForm.role === role && styles.roleOptionActive,
                      ]}
                      onPress={() => setStaffForm({ ...staffForm, role })}
                    >
                      <Text
                        style={[
                          styles.roleOptionText,
                          staffForm.role === role && styles.roleOptionTextActive,
                        ]}
                      >
                        {role}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={styles.addStaffButton} onPress={handleAddStaff}>
                  <Text style={styles.addStaffButtonText}>Add Staff</Text>
                </TouchableOpacity>
              </View>
            )}

            {staff.length > 0 ? (
              staff.map((member) => (
                <View key={member.id} style={styles.staffItem}>
                  <View style={styles.staffInfo}>
                    <Text style={styles.staffName}>{member.name}</Text>
                    <Text style={styles.staffRole}>{member.role}</Text>
                    {member.phone && <Text style={styles.staffPhone}>{member.phone}</Text>}
                  </View>
                  <TouchableOpacity
                    style={styles.deleteStaffButton}
                    onPress={() => handleDeleteStaff(member.id)}
                  >
                    <Ionicons name="trash" size={18} color="#f44336" />
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <Text style={styles.noStaffText}>No staff members added yet</Text>
            )}
          </View>

          {/* Logout */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out" size={24} color="#f44336" />
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>

          {/* App Info */}
          <View style={styles.appInfo}>
            <Text style={styles.appName}>Walia Brothers Jarvis</Text>
            <Text style={styles.appVersion}>Version 1.0.0</Text>
            <Text style={styles.appTagline}>Your Smart Store Assistant</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
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
    marginBottom: 12,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#607D8B',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f3460',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  optionText: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  pinChangeContainer: {
    gap: 0,
  },
  pinActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#0f3460',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#607D8B',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  addButton: {
    padding: 4,
  },
  staffFormContainer: {
    marginBottom: 16,
  },
  roleSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  roleOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0f3460',
    alignItems: 'center',
  },
  roleOptionActive: {
    backgroundColor: '#4CAF50',
  },
  roleOptionText: {
    color: '#aaa',
    fontSize: 13,
  },
  roleOptionTextActive: {
    color: '#fff',
  },
  addStaffButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  addStaffButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  staffItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f3460',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  staffInfo: {
    flex: 1,
  },
  staffName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  staffRole: {
    color: '#4CAF50',
    fontSize: 12,
    marginTop: 2,
  },
  staffPhone: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 2,
  },
  deleteStaffButton: {
    padding: 8,
  },
  noStaffText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4433620',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  logoutButtonText: {
    color: '#f44336',
    fontSize: 18,
    fontWeight: 'bold',
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  appName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  appVersion: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
  appTagline: {
    color: '#4CAF50',
    fontSize: 12,
    marginTop: 8,
  },
});

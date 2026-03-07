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

interface Campaign {
  id: string;
  name: string;
  message: string;
  target_groups: string[];
  scheduled_date: string;
  status: string;
  sent_count: number;
}

interface CustomerGroup {
  id: string;
  name: string;
  description: string;
}

export default function MarketingScreen() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'campaigns' | 'groups'>('campaigns');
  const [campaignModalVisible, setCampaignModalVisible] = useState(false);
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState<string | null>(null);

  // Campaign form
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    message: '',
    target_groups: [] as string[],
    scheduled_date: '',
  });

  // Group form
  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const [campaignsRes, groupsRes] = await Promise.all([
        fetch(`${API_URL}/api/campaigns`),
        fetch(`${API_URL}/api/groups`),
      ]);

      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        setCampaigns(data);
      }

      if (groupsRes.ok) {
        const data = await groupsRes.json();
        setGroups(data);
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

  const handleCreateCampaign = async () => {
    if (!campaignForm.name || !campaignForm.message) {
      Alert.alert('Error', 'Campaign name and message are required');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignForm),
      });

      if (response.ok) {
        setCampaignModalVisible(false);
        setCampaignForm({ name: '', message: '', target_groups: [], scheduled_date: '' });
        fetchData();
        Alert.alert('Success', 'Campaign created successfully');
      } else {
        Alert.alert('Error', 'Failed to create campaign');
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to create campaign');
    }
  };

  const handleSendCampaign = async (campaignId: string) => {
    try {
      setSendingCampaign(campaignId);
      const response = await fetch(`${API_URL}/api/campaigns/${campaignId}/contacts`);
      
      if (response.ok) {
        const data = await response.json();
        const contacts = data.contacts || [];
        const campaign = campaigns.find(c => c.id === campaignId);
        
        if (contacts.length === 0) {
          Alert.alert('No Contacts', 'No contacts found for this campaign target groups');
          return;
        }

        Alert.alert(
          'Send Campaign',
          `This will open WhatsApp for ${contacts.length} contacts. Continue?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Send',
              onPress: () => {
                // Open WhatsApp with first contact
                if (contacts[0] && campaign) {
                  const phone = contacts[0].phone;
                  const message = campaign.message;
                  Linking.openURL(`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`);
                }
              },
            },
          ]
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to get campaign contacts');
    } finally {
      setSendingCampaign(null);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    Alert.alert(
      'Delete Campaign',
      'Are you sure you want to delete this campaign?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/campaigns/${id}`, {
                method: 'DELETE',
              });
              if (response.ok) {
                fetchData();
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete campaign');
            }
          },
        },
      ]
    );
  };

  const handleCreateGroup = async () => {
    if (!groupForm.name) {
      Alert.alert('Error', 'Group name is required');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(groupForm),
      });

      if (response.ok) {
        setGroupModalVisible(false);
        setGroupForm({ name: '', description: '' });
        fetchData();
        Alert.alert('Success', 'Group created successfully');
      } else {
        Alert.alert('Error', 'Failed to create group');
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to create group');
    }
  };

  const handleDeleteGroup = async (id: string) => {
    Alert.alert(
      'Delete Group',
      'Are you sure you want to delete this group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/groups/${id}`, {
                method: 'DELETE',
              });
              if (response.ok) {
                fetchData();
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete group');
            }
          },
        },
      ]
    );
  };

  const toggleGroupSelection = (groupName: string) => {
    setCampaignForm(prev => ({
      ...prev,
      target_groups: prev.target_groups.includes(groupName)
        ? prev.target_groups.filter(g => g !== groupName)
        : [...prev.target_groups, groupName],
    }));
  };

  const renderCampaignItem = ({ item }: { item: Campaign }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <Text style={styles.cardSubtitle}>{item.status}</Text>
        </View>
        <TouchableOpacity
          style={styles.sendButton}
          onPress={() => handleSendCampaign(item.id)}
          disabled={sendingCampaign === item.id}
        >
          {sendingCampaign === item.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.sendButtonText}>Send</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.messageContainer}>
        <Text style={styles.messageText} numberOfLines={3}>
          {item.message}
        </Text>
      </View>

      {item.target_groups.length > 0 && (
        <View style={styles.tagsContainer}>
          {item.target_groups.map((group, idx) => (
            <View key={idx} style={styles.tag}>
              <Text style={styles.tagText}>{group}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteCampaign(item.id)}
        >
          <Ionicons name="trash" size={16} color="#f44336" />
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderGroupItem = ({ item }: { item: CustomerGroup }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          {item.description && (
            <Text style={styles.cardSubtitle}>{item.description}</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteGroup(item.id)}
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
        <Text style={styles.headerTitle}>Marketing</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'campaigns' && styles.tabActive]}
          onPress={() => setActiveTab('campaigns')}
        >
          <Ionicons
            name="megaphone"
            size={20}
            color={activeTab === 'campaigns' ? '#9C27B0' : '#666'}
          />
          <Text style={[styles.tabText, activeTab === 'campaigns' && styles.tabTextActive]}>
            Campaigns
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'groups' && styles.tabActive]}
          onPress={() => setActiveTab('groups')}
        >
          <Ionicons
            name="people"
            size={20}
            color={activeTab === 'groups' ? '#9C27B0' : '#666'}
          />
          <Text style={[styles.tabText, activeTab === 'groups' && styles.tabTextActive]}>
            Groups
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#9C27B0" />
        </View>
      ) : (
        <FlatList
          data={activeTab === 'campaigns' ? campaigns : groups}
          renderItem={activeTab === 'campaigns' ? renderCampaignItem : renderGroupItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9C27B0" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name={activeTab === 'campaigns' ? 'megaphone-outline' : 'people-outline'}
                size={64}
                color="#666"
              />
              <Text style={styles.emptyText}>
                No {activeTab} found
              </Text>
              <Text style={styles.emptySubtext}>
                Create your first {activeTab === 'campaigns' ? 'campaign' : 'group'}
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          if (activeTab === 'campaigns') {
            setCampaignForm({ name: '', message: '', target_groups: [], scheduled_date: '' });
            setCampaignModalVisible(true);
          } else {
            setGroupForm({ name: '', description: '' });
            setGroupModalVisible(true);
          }
        }}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Campaign Modal */}
      <Modal
        visible={campaignModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCampaignModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Campaign</Text>
              <TouchableOpacity onPress={() => setCampaignModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <Text style={styles.inputLabel}>Campaign Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Diwali Sale 2024"
                placeholderTextColor="#666"
                value={campaignForm.name}
                onChangeText={(text) => setCampaignForm({ ...campaignForm, name: text })}
              />

              <Text style={styles.inputLabel}>Message *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Type your promotional message here..."
                placeholderTextColor="#666"
                value={campaignForm.message}
                onChangeText={(text) => setCampaignForm({ ...campaignForm, message: text })}
                multiline
              />

              <Text style={styles.inputLabel}>Target Groups (Optional)</Text>
              <View style={styles.groupSelector}>
                {groups.length > 0 ? (
                  groups.map((group) => (
                    <TouchableOpacity
                      key={group.id}
                      style={[
                        styles.groupOption,
                        campaignForm.target_groups.includes(group.name) && styles.groupOptionActive,
                      ]}
                      onPress={() => toggleGroupSelection(group.name)}
                    >
                      <Text
                        style={[
                          styles.groupOptionText,
                          campaignForm.target_groups.includes(group.name) && styles.groupOptionTextActive,
                        ]}
                      >
                        {group.name}
                      </Text>
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={styles.noGroupsText}>No groups created yet. Leave empty to target all customers.</Text>
                )}
              </View>

              <TouchableOpacity style={styles.saveButton} onPress={handleCreateCampaign}>
                <Text style={styles.saveButtonText}>Create Campaign</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Group Modal */}
      <Modal
        visible={groupModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setGroupModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Group</Text>
              <TouchableOpacity onPress={() => setGroupModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <Text style={styles.inputLabel}>Group Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., TV Customers, AC Buyers"
                placeholderTextColor="#666"
                value={groupForm.name}
                onChangeText={(text) => setGroupForm({ ...groupForm, name: text })}
              />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Describe this group..."
                placeholderTextColor="#666"
                value={groupForm.description}
                onChangeText={(text) => setGroupForm({ ...groupForm, description: text })}
                multiline
              />

              <TouchableOpacity style={styles.saveButton} onPress={handleCreateGroup}>
                <Text style={styles.saveButtonText}>Create Group</Text>
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  tabActive: {
    backgroundColor: '#9C27B020',
  },
  tabText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#9C27B0',
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
  card: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardSubtitle: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 4,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#25D366',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  messageContainer: {
    backgroundColor: '#0f3460',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  messageText: {
    color: '#ddd',
    fontSize: 14,
    lineHeight: 20,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
  },
  tag: {
    backgroundColor: '#9C27B020',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    color: '#9C27B0',
    fontSize: 12,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 8,
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
    backgroundColor: '#9C27B0',
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
    maxHeight: '85%',
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
  groupSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  groupOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#0f3460',
  },
  groupOptionActive: {
    backgroundColor: '#9C27B0',
  },
  groupOptionText: {
    color: '#aaa',
    fontSize: 14,
  },
  groupOptionTextActive: {
    color: '#fff',
  },
  noGroupsText: {
    color: '#666',
    fontSize: 14,
    fontStyle: 'italic',
  },
  saveButton: {
    backgroundColor: '#9C27B0',
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

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Animated,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://smart-store-ai-2.preview.emergentagent.com';

interface ChatMessage {
  role: 'user' | 'jarvis';
  content: string;
  timestamp: Date;
  action?: string;
}

interface JarvisSettings {
  voiceEnabled: boolean;
  voiceLanguage: 'en' | 'hi' | 'both';
  voicePitch: number;
  voiceRate: number;
}

interface DailyBrief {
  pendingTasks: number;
  newLeads: number;
  pendingComplaints: number;
  pendingApprovals: number;
  criticalAlerts: string[];
  suggestions: string[];
}

export default function JarvisScreen() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dailyBrief, setDailyBrief] = useState<DailyBrief | null>(null);
  const [hasWelcomed, setHasWelcomed] = useState(false);
  
  const [settings, setSettings] = useState<JarvisSettings>({
    voiceEnabled: true,
    voiceLanguage: 'both',
    voicePitch: 0.7, // Lower pitch for deep manly voice
    voiceRate: 0.85,
  });

  // Load settings from storage
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const saved = await AsyncStorage.getItem('jarvis_settings');
      if (saved) {
        setSettings(JSON.parse(saved));
      }
    } catch (e) {
      console.log('Error loading settings:', e);
    }
  };

  const saveSettings = async (newSettings: JarvisSettings) => {
    try {
      await AsyncStorage.setItem('jarvis_settings', JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (e) {
      console.log('Error saving settings:', e);
    }
  };

  // Fetch daily brief and welcome user
  useEffect(() => {
    if (!hasWelcomed) {
      fetchDailyBriefAndWelcome();
    }
  }, [hasWelcomed]);

  const fetchDailyBriefAndWelcome = async () => {
    try {
      // Fetch all stats
      const [statsRes, approvalsRes, notificationsRes] = await Promise.all([
        fetch(`${API_URL}/api/dashboard/stats`),
        fetch(`${API_URL}/api/approvals`),
        fetch(`${API_URL}/api/notifications`),
      ]);

      let brief: DailyBrief = {
        pendingTasks: 0,
        newLeads: 0,
        pendingComplaints: 0,
        pendingApprovals: 0,
        criticalAlerts: [],
        suggestions: [],
      };

      if (statsRes.ok) {
        const stats = await statsRes.json();
        brief.newLeads = stats.new_leads || 0;
        brief.pendingComplaints = stats.pending_complaints || 0;
      }

      if (approvalsRes.ok) {
        const approvals = await approvalsRes.json();
        brief.pendingApprovals = approvals.length || 0;
      }

      if (notificationsRes.ok) {
        const notifications = await notificationsRes.json();
        brief.pendingTasks = (notifications.total_new_leads || 0) + (notifications.total_pending_complaints || 0);
      }

      // Generate alerts
      if (brief.pendingComplaints > 3) {
        brief.criticalAlerts.push(`${brief.pendingComplaints} complaints pending - customers waiting!`);
      }
      if (brief.pendingApprovals > 0) {
        brief.criticalAlerts.push(`${brief.pendingApprovals} AI responses waiting for your approval`);
      }

      // Generate suggestions
      if (brief.newLeads > 0) {
        brief.suggestions.push(`Follow up with ${brief.newLeads} new leads today`);
      }
      brief.suggestions.push('Check inventory for fast-moving items');

      setDailyBrief(brief);
      
      // Generate welcome message
      const welcomeMessage = generateWelcomeMessage(brief);
      
      setMessages([{
        role: 'jarvis',
        content: welcomeMessage,
        timestamp: new Date(),
      }]);

      setHasWelcomed(true);

      // Speak welcome if voice enabled
      if (settings.voiceEnabled) {
        setTimeout(() => {
          speakText(welcomeMessage);
        }, 500);
      }

    } catch (error) {
      console.log('Error fetching brief:', error);
      const fallbackWelcome = "Good morning, Sir! I'm Jarvis, your store assistant. How may I help you today?";
      setMessages([{
        role: 'jarvis',
        content: fallbackWelcome,
        timestamp: new Date(),
      }]);
      setHasWelcomed(true);
      if (settings.voiceEnabled) {
        speakText(fallbackWelcome);
      }
    }
  };

  const generateWelcomeMessage = (brief: DailyBrief): string => {
    const hour = new Date().getHours();
    let greeting = '';
    
    if (hour < 12) {
      greeting = 'Good morning';
    } else if (hour < 17) {
      greeting = 'Good afternoon';
    } else {
      greeting = 'Good evening';
    }

    let message = `${greeting}, Sir! Welcome back to Walia Brothers.\n\n`;
    message += `📊 Here's your daily brief:\n`;
    
    if (brief.newLeads > 0) {
      message += `• ${brief.newLeads} new leads waiting for follow-up\n`;
    }
    if (brief.pendingComplaints > 0) {
      message += `• ${brief.pendingComplaints} pending complaints need attention\n`;
    }
    if (brief.pendingApprovals > 0) {
      message += `• ${brief.pendingApprovals} AI responses awaiting your approval\n`;
    }

    if (brief.criticalAlerts.length > 0) {
      message += `\n⚠️ Priority:\n`;
      brief.criticalAlerts.forEach(alert => {
        message += `• ${alert}\n`;
      });
    }

    if (brief.suggestions.length > 0) {
      message += `\n💡 Suggestions:\n`;
      brief.suggestions.forEach(suggestion => {
        message += `• ${suggestion}\n`;
      });
    }

    message += `\nI'm ready to assist you, Sir. What would you like me to do?`;
    
    return message;
  };

  // Text-to-Speech with Jarvis-like voice
  const speakText = async (text: string) => {
    if (!settings.voiceEnabled) return;
    
    // Stop any ongoing speech
    await Speech.stop();
    setIsSpeaking(true);

    // Clean text for speech
    const cleanText = text
      .replace(/[📊💡⚠️✅❌🎯]/g, '')
      .replace(/•/g, '')
      .replace(/\n+/g, '. ')
      .trim();

    try {
      await Speech.speak(cleanText, {
        language: settings.voiceLanguage === 'hi' ? 'hi-IN' : 'en-IN',
        pitch: settings.voicePitch,
        rate: settings.voiceRate,
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    } catch (error) {
      console.log('Speech error:', error);
      setIsSpeaking(false);
    }
  };

  const stopSpeaking = async () => {
    await Speech.stop();
    setIsSpeaking(false);
  };

  // Pulse animation for listening
  useEffect(() => {
    if (isListening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening]);

  // Voice recording (simulated - will show text input for now)
  const startListening = async () => {
    setIsListening(true);
    Vibration.vibrate(100);
    
    // Note: Full voice recognition requires native module setup
    // For now, we'll use text input with voice toggle indication
    Alert.alert(
      '🎤 Voice Mode Active',
      'Voice recognition is being set up. For now, please type your command.\n\nTip: Say things like:\n• "Show me today\'s leads"\n• "Create a new complaint"\n• "What\'s pending?"',
      [{ text: 'OK', onPress: () => setIsListening(false) }]
    );
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  // Send message to Jarvis AI
  const sendMessage = async (customMessage?: string) => {
    const userMessage = (customMessage || message).trim();
    if (!userMessage || loading) return;

    setMessage('');
    setIsListening(false);
    
    // Add user message
    setMessages(prev => [...prev, { 
      role: 'user', 
      content: userMessage,
      timestamp: new Date(),
    }]);
    scrollToBottom();
    
    setLoading(true);
    try {
      // Use the command endpoint for full action execution
      const response = await fetch(`${API_URL}/api/ai/jarvis-command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: userMessage,
        }),
      });

      let jarvisResponse = '';
      let actionTaken = null;
      let navigateTo = null;
      
      if (response.ok) {
        const data = await response.json();
        jarvisResponse = data.response;
        actionTaken = data.action;
        navigateTo = data.navigate_to;
      } else {
        jarvisResponse = "I apologize, Sir. I'm having trouble processing that request. Could you please try again?";
      }
      
      setMessages(prev => [...prev, {
        role: 'jarvis',
        content: jarvisResponse,
        timestamp: new Date(),
        action: actionTaken,
      }]);

      // Speak response if enabled
      if (settings.voiceEnabled) {
        speakText(jarvisResponse);
      }

      // Handle navigation
      if (navigateTo) {
        setTimeout(() => {
          router.push(navigateTo);
        }, 2000);
      }
      
    } catch (error) {
      console.log('Jarvis error:', error);
      const errorMsg = "I'm experiencing a connection issue, Sir. Please check your internet connection.";
      setMessages(prev => [...prev, {
        role: 'jarvis',
        content: errorMsg,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const handleJarvisAction = (action: string, data: any) => {
    switch (action) {
      case 'navigate':
        if (data?.screen) {
          router.push(data.screen);
        }
        break;
      case 'create_lead':
        router.push('/leads');
        break;
      case 'create_complaint':
        router.push('/complaints');
        break;
      case 'show_stats':
        router.push('/dashboard');
        break;
    }
  };

  const quickCommands = [
    { text: "Show pending tasks", icon: "list" },
    { text: "Update product prices", icon: "pricetag" },
    { text: "Check complaints", icon: "construct" },
    { text: "Create new lead", icon: "person-add" },
    { text: "Add new product", icon: "add-circle" },
    { text: "Store stats", icon: "stats-chart" },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>J.A.R.V.I.S</Text>
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, isSpeaking && styles.statusDotActive]} />
            <Text style={styles.statusText}>
              {isSpeaking ? 'Speaking...' : isListening ? 'Listening...' : 'Ready'}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsButton}>
          <Ionicons name="ellipsis-vertical" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Voice Status Indicator */}
      {(isSpeaking || isListening) && (
        <View style={styles.voiceIndicator}>
          <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]}>
            <Ionicons 
              name={isSpeaking ? "volume-high" : "mic"} 
              size={24} 
              color="#00BCD4" 
            />
          </Animated.View>
          <Text style={styles.voiceIndicatorText}>
            {isSpeaking ? 'Jarvis is speaking...' : 'Listening...'}
          </Text>
          {isSpeaking && (
            <TouchableOpacity onPress={stopSpeaking} style={styles.stopButton}>
              <Ionicons name="stop" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.chatContainer}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={scrollToBottom}
        >
          {messages.map((msg, idx) => (
            <View
              key={idx}
              style={[
                styles.messageBubble,
                msg.role === 'user' ? styles.userBubble : styles.jarvisBubble,
              ]}
            >
              {msg.role === 'jarvis' && (
                <View style={styles.jarvisHeader}>
                  <View style={styles.jarvisIcon}>
                    <Ionicons name="hardware-chip" size={16} color="#00BCD4" />
                  </View>
                  <Text style={styles.jarvisLabel}>JARVIS</Text>
                  {settings.voiceEnabled && (
                    <TouchableOpacity 
                      onPress={() => speakText(msg.content)}
                      style={styles.speakButton}
                    >
                      <Ionicons name="volume-medium" size={16} color="#00BCD4" />
                    </TouchableOpacity>
                  )}
                </View>
              )}
              <Text style={styles.messageText}>{msg.content}</Text>
              <Text style={styles.timestamp}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          ))}

          {loading && (
            <View style={styles.loadingBubble}>
              <View style={styles.typingDots}>
                <View style={[styles.dot, styles.dot1]} />
                <View style={[styles.dot, styles.dot2]} />
                <View style={[styles.dot, styles.dot3]} />
              </View>
              <Text style={styles.loadingText}>Jarvis is thinking...</Text>
            </View>
          )}
        </ScrollView>

        {/* Quick Commands */}
        {messages.length <= 2 && (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.quickCommandsContainer}
            contentContainerStyle={styles.quickCommandsContent}
          >
            {quickCommands.map((cmd, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.quickCommandChip}
                onPress={() => sendMessage(cmd.text)}
              >
                <Ionicons name={cmd.icon as any} size={16} color="#00BCD4" />
                <Text style={styles.quickCommandText}>{cmd.text}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={[styles.voiceButton, isListening && styles.voiceButtonActive]}
            onPress={startListening}
          >
            <Ionicons name="mic" size={24} color={isListening ? "#fff" : "#00BCD4"} />
          </TouchableOpacity>
          
          <TextInput
            style={styles.input}
            placeholder="Ask Jarvis anything..."
            placeholderTextColor="#666"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={500}
            onSubmitEditing={() => sendMessage()}
          />
          
          <TouchableOpacity
            style={[styles.sendButton, (!message.trim() || loading) && styles.sendButtonDisabled]}
            onPress={() => sendMessage()}
            disabled={!message.trim() || loading}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Settings Modal */}
      <Modal visible={showSettings} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Jarvis Settings</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              {/* Voice Toggle */}
              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Ionicons name="volume-high" size={24} color="#00BCD4" />
                  <View style={styles.settingText}>
                    <Text style={styles.settingLabel}>Voice Responses</Text>
                    <Text style={styles.settingDesc}>Jarvis will speak his responses</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.toggle, settings.voiceEnabled && styles.toggleActive]}
                  onPress={() => saveSettings({ ...settings, voiceEnabled: !settings.voiceEnabled })}
                >
                  <View style={[styles.toggleKnob, settings.voiceEnabled && styles.toggleKnobActive]} />
                </TouchableOpacity>
              </View>

              {/* Language Selection */}
              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Ionicons name="language" size={24} color="#00BCD4" />
                  <View style={styles.settingText}>
                    <Text style={styles.settingLabel}>Voice Language</Text>
                    <Text style={styles.settingDesc}>Select voice language preference</Text>
                  </View>
                </View>
              </View>
              <View style={styles.languageOptions}>
                {[
                  { value: 'en', label: 'English' },
                  { value: 'hi', label: 'Hindi' },
                  { value: 'both', label: 'Hinglish' },
                ].map((lang) => (
                  <TouchableOpacity
                    key={lang.value}
                    style={[
                      styles.languageChip,
                      settings.voiceLanguage === lang.value && styles.languageChipActive,
                    ]}
                    onPress={() => saveSettings({ ...settings, voiceLanguage: lang.value as any })}
                  >
                    <Text style={[
                      styles.languageChipText,
                      settings.voiceLanguage === lang.value && styles.languageChipTextActive,
                    ]}>
                      {lang.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Voice Speed */}
              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Ionicons name="speedometer" size={24} color="#00BCD4" />
                  <View style={styles.settingText}>
                    <Text style={styles.settingLabel}>Voice Speed</Text>
                    <Text style={styles.settingDesc}>Adjust how fast Jarvis speaks</Text>
                  </View>
                </View>
              </View>
              <View style={styles.speedOptions}>
                {[
                  { value: 0.8, label: 'Slow' },
                  { value: 0.95, label: 'Normal' },
                  { value: 1.2, label: 'Fast' },
                ].map((speed) => (
                  <TouchableOpacity
                    key={speed.value}
                    style={[
                      styles.speedChip,
                      settings.voiceRate === speed.value && styles.speedChipActive,
                    ]}
                    onPress={() => saveSettings({ ...settings, voiceRate: speed.value })}
                  >
                    <Text style={[
                      styles.speedChipText,
                      settings.voiceRate === speed.value && styles.speedChipTextActive,
                    ]}>
                      {speed.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Test Voice */}
              <TouchableOpacity
                style={styles.testVoiceButton}
                onPress={() => speakText("Hello Sir, I am Jarvis, your personal store assistant. How may I help you today?")}
              >
                <Ionicons name="play" size={20} color="#fff" />
                <Text style={styles.testVoiceText}>Test Voice</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#0f1528' },
  backButton: { padding: 4 },
  headerContent: { flex: 1, marginLeft: 12 },
  headerTitle: { color: '#00BCD4', fontSize: 20, fontWeight: 'bold', letterSpacing: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50', marginRight: 6 },
  statusDotActive: { backgroundColor: '#00BCD4' },
  statusText: { color: '#aaa', fontSize: 12 },
  settingsButton: { padding: 8 },
  voiceIndicator: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: '#00BCD410', 
    paddingVertical: 12,
    gap: 12,
  },
  pulseCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#00BCD420',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceIndicatorText: { color: '#00BCD4', fontSize: 14, fontWeight: '600' },
  stopButton: {
    backgroundColor: '#f44336',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatContainer: { flex: 1 },
  messagesContainer: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 8 },
  messageBubble: { maxWidth: '90%', borderRadius: 16, padding: 14, marginBottom: 12 },
  userBubble: { backgroundColor: '#1a237e', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  jarvisBubble: { 
    backgroundColor: '#0f1528', 
    alignSelf: 'flex-start', 
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#00BCD430',
  },
  jarvisHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  jarvisIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#00BCD420',
    justifyContent: 'center',
    alignItems: 'center',
  },
  jarvisLabel: { color: '#00BCD4', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  speakButton: { marginLeft: 'auto', padding: 4 },
  messageText: { color: '#fff', fontSize: 15, lineHeight: 22 },
  timestamp: { color: '#666', fontSize: 10, marginTop: 8, alignSelf: 'flex-end' },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f1528',
    alignSelf: 'flex-start',
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: '#00BCD430',
  },
  typingDots: { flexDirection: 'row', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00BCD4' },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.7 },
  dot3: { opacity: 1 },
  loadingText: { color: '#aaa', fontSize: 14 },
  quickCommandsContainer: { maxHeight: 50, marginBottom: 8 },
  quickCommandsContent: { paddingHorizontal: 16, gap: 8 },
  quickCommandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f1528',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#00BCD450',
    gap: 8,
  },
  quickCommandText: { color: '#00BCD4', fontSize: 13 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#0f1528',
    gap: 10,
  },
  voiceButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#00BCD420',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#00BCD450',
  },
  voiceButtonActive: { backgroundColor: '#00BCD4' },
  input: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#00BCD430',
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#00BCD4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: { opacity: 0.5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#0f1528', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  modalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 20, 
    borderBottomWidth: 1, 
    borderBottomColor: '#1a1a2e' 
  },
  modalTitle: { color: '#00BCD4', fontSize: 20, fontWeight: 'bold' },
  modalBody: { padding: 20 },
  settingItem: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  settingInfo: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 },
  settingText: { flex: 1 },
  settingLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  settingDesc: { color: '#666', fontSize: 12, marginTop: 4 },
  toggle: {
    width: 52,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1a1a2e',
    padding: 2,
  },
  toggleActive: { backgroundColor: '#00BCD4' },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#666',
  },
  toggleKnobActive: { 
    backgroundColor: '#fff',
    transform: [{ translateX: 24 }],
  },
  languageOptions: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  languageChip: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
  },
  languageChipActive: { backgroundColor: '#00BCD4' },
  languageChipText: { color: '#aaa', fontSize: 14, fontWeight: '600' },
  languageChipTextActive: { color: '#fff' },
  speedOptions: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  speedChip: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
  },
  speedChipActive: { backgroundColor: '#00BCD4' },
  speedChipText: { color: '#aaa', fontSize: 14, fontWeight: '600' },
  speedChipTextActive: { color: '#fff' },
  testVoiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00BCD4',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 10,
    marginTop: 24,
    marginBottom: 40,
  },
  testVoiceText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

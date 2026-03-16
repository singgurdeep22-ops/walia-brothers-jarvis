import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Modal,
  Text,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Vibration,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://smart-store-ai-2.preview.emergentagent.com';

// Jarvis Context
interface JarvisContextType {
  openJarvis: () => void;
  closeJarvis: () => void;
  isOpen: boolean;
  speak: (text: string) => void;
}

const JarvisContext = createContext<JarvisContextType | null>(null);

export const useJarvis = () => {
  const context = useContext(JarvisContext);
  if (!context) {
    throw new Error('useJarvis must be used within JarvisProvider');
  }
  return context;
};

// Global Jarvis Modal Component
function JarvisModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [settings] = useState({
    voiceEnabled: true,
    voicePitch: 0.7, // Lower pitch for manly voice
    voiceRate: 0.85,
  });

  useEffect(() => {
    if (visible && messages.length === 0) {
      const welcomeMsg = "Yes Sir, how may I assist you?";
      setMessages([{ role: 'jarvis', content: welcomeMsg, timestamp: new Date() }]);
      if (settings.voiceEnabled) {
        speakText(welcomeMsg);
      }
    }
  }, [visible]);

  const speakText = async (text: string) => {
    if (!settings.voiceEnabled) return;
    await Speech.stop();
    setIsSpeaking(true);
    
    const cleanText = text.replace(/[📊💡⚠️✅❌🎯•]/g, '').replace(/\n+/g, '. ').trim();
    
    try {
      await Speech.speak(cleanText, {
        language: 'en-IN',
        pitch: settings.voicePitch,
        rate: settings.voiceRate,
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    } catch (error) {
      setIsSpeaking(false);
    }
  };

  const stopSpeaking = async () => {
    await Speech.stop();
    setIsSpeaking(false);
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const sendMessage = async () => {
    if (!message.trim() || loading) return;

    const userMessage = message.trim();
    setMessage('');
    
    setMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }]);
    scrollToBottom();
    
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/ai/jarvis-command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: userMessage }),
      });

      if (response.ok) {
        const data = await response.json();
        
        setMessages(prev => [...prev, {
          role: 'jarvis',
          content: data.response,
          timestamp: new Date(),
          action: data.action,
        }]);

        if (settings.voiceEnabled) {
          speakText(data.response);
        }

        if (data.navigate_to) {
          setTimeout(() => {
            onClose();
            router.push(data.navigate_to);
          }, 1500);
        }
      } else {
        throw new Error('Request failed');
      }
    } catch (error) {
      const errorMsg = "I apologize Sir, I'm having trouble processing that. Please try again.";
      setMessages(prev => [...prev, {
        role: 'jarvis',
        content: errorMsg,
        timestamp: new Date(),
      }]);
      if (settings.voiceEnabled) speakText(errorMsg);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const quickCommands = ["Show leads", "Update prices", "Check complaints", "Store stats"];

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={styles.jarvisIconSmall}>
              <Ionicons name="hardware-chip" size={20} color="#00BCD4" />
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.modalTitle}>J.A.R.V.I.S</Text>
              <Text style={styles.modalSubtitle}>
                {isSpeaking ? 'Speaking...' : 'Ready to assist'}
              </Text>
            </View>
            {isSpeaking && (
              <TouchableOpacity onPress={stopSpeaking} style={styles.stopBtn}>
                <Ionicons name="stop" size={16} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesArea}
            contentContainerStyle={styles.messagesContent}
            onContentSizeChange={scrollToBottom}
          >
            {messages.map((msg, idx) => (
              <View
                key={idx}
                style={[styles.msgBubble, msg.role === 'user' ? styles.userBubble : styles.jarvisBubble]}
              >
                {msg.role === 'jarvis' && (
                  <View style={styles.jarvisTag}>
                    <Ionicons name="hardware-chip" size={12} color="#00BCD4" />
                    <Text style={styles.jarvisTagText}>JARVIS</Text>
                  </View>
                )}
                <Text style={styles.msgText}>{msg.content}</Text>
                {msg.action && (
                  <View style={styles.actionBadge}>
                    <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
                    <Text style={styles.actionText}>Action completed</Text>
                  </View>
                )}
              </View>
            ))}
            {loading && (
              <View style={styles.loadingBubble}>
                <ActivityIndicator size="small" color="#00BCD4" />
                <Text style={styles.loadingText}>Processing...</Text>
              </View>
            )}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.quickCmds}
            contentContainerStyle={styles.quickCmdsContent}
          >
            {quickCommands.map((cmd, idx) => (
              <TouchableOpacity key={idx} style={styles.quickCmdChip} onPress={() => setMessage(cmd)}>
                <Text style={styles.quickCmdText}>{cmd}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.inputArea}>
            <TextInput
              style={styles.input}
              placeholder="Command Jarvis..."
              placeholderTextColor="#666"
              value={message}
              onChangeText={setMessage}
              onSubmitEditing={sendMessage}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!message.trim() || loading) && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={!message.trim() || loading}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function RootLayout() {
  const pathname = usePathname();
  const [jarvisOpen, setJarvisOpen] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const openJarvis = () => setJarvisOpen(true);
  const closeJarvis = () => setJarvisOpen(false);
  
  const speak = async (text: string) => {
    await Speech.speak(text, { language: 'en-IN', pitch: 0.7, rate: 0.85 });
  };

  const showFab = pathname !== '/' && pathname !== '/jarvis';

  useEffect(() => {
    if (showFab) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [showFab]);

  return (
    <JarvisContext.Provider value={{ openJarvis, closeJarvis, isOpen: jarvisOpen, speak }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#1a1a2e' },
            animation: 'slide_from_right',
          }}
        />
        
        {/* Floating Jarvis Button */}
        {showFab && (
          <Animated.View style={[styles.fab, { transform: [{ scale: pulseAnim }] }]}>
            <TouchableOpacity
              style={styles.fabButton}
              onPress={() => {
                Vibration.vibrate(50);
                openJarvis();
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="hardware-chip" size={28} color="#fff" />
            </TouchableOpacity>
          </Animated.View>
        )}
        
        <JarvisModal visible={jarvisOpen} onClose={closeJarvis} />
      </SafeAreaProvider>
    </JarvisContext.Provider>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    zIndex: 1000,
  },
  fabButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#00BCD4',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#0a0a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  jarvisIconSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00BCD420',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: { flex: 1, marginLeft: 12 },
  modalTitle: { color: '#00BCD4', fontSize: 18, fontWeight: 'bold', letterSpacing: 1 },
  modalSubtitle: { color: '#666', fontSize: 12, marginTop: 2 },
  stopBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f44336',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  closeBtn: { padding: 4 },
  messagesArea: { flex: 1, maxHeight: 300 },
  messagesContent: { padding: 16 },
  msgBubble: { maxWidth: '85%', borderRadius: 16, padding: 12, marginBottom: 10 },
  userBubble: { backgroundColor: '#1a237e', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  jarvisBubble: {
    backgroundColor: '#0f1528',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#00BCD430',
  },
  jarvisTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  jarvisTagText: { color: '#00BCD4', fontSize: 10, fontWeight: 'bold' },
  msgText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  actionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    backgroundColor: '#4CAF5020',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  actionText: { color: '#4CAF50', fontSize: 11 },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0f1528',
    padding: 12,
    borderRadius: 16,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#00BCD430',
  },
  loadingText: { color: '#666', fontSize: 13 },
  quickCmds: { maxHeight: 44, borderTopWidth: 1, borderTopColor: '#1a1a2e' },
  quickCmdsContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  quickCmdChip: {
    backgroundColor: '#00BCD420',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#00BCD450',
  },
  quickCmdText: { color: '#00BCD4', fontSize: 12 },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#1a1a2e',
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#00BCD430',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#00BCD4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
});

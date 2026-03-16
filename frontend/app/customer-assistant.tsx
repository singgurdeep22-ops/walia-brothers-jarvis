import React, { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://smart-store-ai-2.preview.emergentagent.com';

interface ChatMessage {
  role: 'customer' | 'assistant';
  content: string;
  action?: string;
  leadCreated?: any;
  complaintCreated?: any;
}

export default function CustomerAssistantScreen() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '' });
  const [showInfoModal, setShowInfoModal] = useState(false);

  useEffect(() => {
    // Add welcome message
    setMessages([{
      role: 'assistant',
      content: 'Sat Sri Akal! 🙏 Welcome to Walia Brothers Electronics!\n\nI\'m your AI assistant. I can help you with:\n\n• Buying TVs, ACs, Refrigerators & more\n• Registering service complaints\n• Product information & prices\n\nHow can I help you today?'
    }]);
  }, []);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const sendMessage = async () => {
    if (!message.trim() || loading) return;

    const userMessage = message.trim();
    setMessage('');
    
    // Add user message to chat
    setMessages(prev => [...prev, { role: 'customer', content: userMessage }]);
    scrollToBottom();
    
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/ai/customer-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          customer_name: customerInfo.name,
          customer_phone: customerInfo.phone,
          session_id: sessionId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.response,
          action: data.action_taken,
          leadCreated: data.lead_created,
          complaintCreated: data.complaint_created,
        };
        
        setMessages(prev => [...prev, assistantMessage]);
        
        // Show notification if lead or complaint was created
        if (data.action_taken === 'lead_created') {
          Alert.alert(
            '✅ Lead Created!',
            `New lead for ${data.lead_created?.customer_name} - ${data.lead_created?.product}`,
            [{ text: 'OK' }]
          );
        } else if (data.action_taken === 'complaint_created') {
          Alert.alert(
            '✅ Complaint Registered!',
            `Complaint for ${data.complaint_created?.customer_name} - ${data.complaint_created?.brand} ${data.complaint_created?.issue}`,
            [{ text: 'OK' }]
          );
        }
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'I apologize, I\'m having trouble right now. Please try again or call us directly.'
        }]);
      }
    } catch (error) {
      console.log('Chat error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Connection error. Please check your internet and try again.'
      }]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const resetChat = () => {
    Alert.alert(
      'New Conversation',
      'Start a new conversation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes',
          onPress: () => {
            setMessages([{
              role: 'assistant',
              content: 'Sat Sri Akal! 🙏 Welcome to Walia Brothers Electronics!\n\nHow can I help you today?'
            }]);
            setCustomerInfo({ name: '', phone: '' });
          }
        }
      ]
    );
  };

  const quickReplies = [
    "I want to buy a TV",
    "I want to buy an AC",
    "I have a complaint",
    "What brands do you have?",
  ];

  const handleQuickReply = (reply: string) => {
    setMessage(reply);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Customer Assistant</Text>
          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>AI Active</Text>
          </View>
        </View>
        <TouchableOpacity onPress={resetChat} style={styles.resetButton}>
          <Ionicons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={18} color="#4CAF50" />
        <Text style={styles.infoText}>
          AI will automatically create leads & complaints from conversations
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.chatContainer}
        keyboardVerticalOffset={0}
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
                msg.role === 'customer' ? styles.customerBubble : styles.assistantBubble,
              ]}
            >
              {msg.role === 'assistant' && (
                <View style={styles.assistantHeader}>
                  <Ionicons name="hardware-chip" size={14} color="#4CAF50" />
                  <Text style={styles.assistantLabel}>Jarvis</Text>
                </View>
              )}
              <Text style={styles.messageText}>{msg.content}</Text>
              
              {/* Action badge */}
              {msg.action && (
                <View style={styles.actionBadge}>
                  <Ionicons 
                    name={msg.action === 'lead_created' ? 'person-add' : 'construct'} 
                    size={14} 
                    color="#fff" 
                  />
                  <Text style={styles.actionText}>
                    {msg.action === 'lead_created' ? 'Lead Created' : 'Complaint Registered'}
                  </Text>
                </View>
              )}
            </View>
          ))}

          {loading && (
            <View style={styles.loadingBubble}>
              <ActivityIndicator size="small" color="#4CAF50" />
              <Text style={styles.loadingText}>Jarvis is typing...</Text>
            </View>
          )}
        </ScrollView>

        {/* Quick Replies */}
        {messages.length <= 2 && (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.quickRepliesContainer}
            contentContainerStyle={styles.quickRepliesContent}
          >
            {quickReplies.map((reply, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.quickReplyChip}
                onPress={() => handleQuickReply(reply)}
              >
                <Text style={styles.quickReplyText}>{reply}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type your message..."
            placeholderTextColor="#666"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={500}
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!message.trim() || loading) && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!message.trim() || loading}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 6,
  },
  statusText: {
    color: '#4CAF50',
    fontSize: 12,
  },
  resetButton: {
    padding: 8,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF5015',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  infoText: {
    flex: 1,
    color: '#4CAF50',
    fontSize: 12,
  },
  chatContainer: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
  messageBubble: {
    maxWidth: '85%',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  customerBubble: {
    backgroundColor: '#4CAF50',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#16213e',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#4CAF5030',
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  assistantLabel: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },
  messageText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  actionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
    gap: 6,
    alignSelf: 'flex-start',
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    alignSelf: 'flex-start',
    borderRadius: 16,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#4CAF5030',
  },
  loadingText: {
    color: '#aaa',
    fontSize: 14,
  },
  quickRepliesContainer: {
    maxHeight: 50,
    marginBottom: 8,
  },
  quickRepliesContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  quickReplyChip: {
    backgroundColor: '#16213e',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#4CAF5050',
  },
  quickReplyText: {
    color: '#4CAF50',
    fontSize: 13,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#16213e',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#0f3460',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});

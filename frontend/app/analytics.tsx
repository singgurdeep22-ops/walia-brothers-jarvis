import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function AnalyticsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const quickQueries = [
    'What are our top selling brands?',
    'How many pending complaints do we have?',
    'Give me sales insights',
    'Who are our most active customers?',
    'What should we focus on today?',
  ];

  const handleSendQuery = async (queryText?: string) => {
    const text = queryText || query;
    if (!text.trim()) return;

    const userMessage: ChatMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text }),
      });

      if (response.ok) {
        const data = await response.json();
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.response || 'No response from Jarvis',
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        const errorData = await response.json();
        const errorMessage: ChatMessage = {
          role: 'assistant',
          content: `Error: ${errorData.detail || 'Failed to get response'}`,
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Unable to connect to Jarvis. Please try again.',
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>AI Analytics</Text>
          <Text style={styles.headerSubtitle}>Ask Jarvis anything</Text>
        </View>
        <View style={styles.jarvisIcon}>
          <Ionicons name="hardware-chip" size={28} color="#E91E63" />
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <ScrollView
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
        >
          {messages.length === 0 ? (
            <View style={styles.welcomeContainer}>
              <View style={styles.welcomeIconContainer}>
                <Ionicons name="sparkles" size={48} color="#E91E63" />
              </View>
              <Text style={styles.welcomeTitle}>Hello! I'm Jarvis</Text>
              <Text style={styles.welcomeText}>
                Your AI-powered store assistant. Ask me anything about your customers, sales, leads, or get business insights.
              </Text>

              <Text style={styles.quickQueriesTitle}>Try asking:</Text>
              <View style={styles.quickQueriesContainer}>
                {quickQueries.map((q, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.quickQueryChip}
                    onPress={() => handleSendQuery(q)}
                  >
                    <Text style={styles.quickQueryText}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            messages.map((msg, idx) => (
              <View
                key={idx}
                style={[
                  styles.messageBubble,
                  msg.role === 'user' ? styles.userBubble : styles.assistantBubble,
                ]}
              >
                {msg.role === 'assistant' && (
                  <View style={styles.assistantHeader}>
                    <Ionicons name="hardware-chip" size={16} color="#E91E63" />
                    <Text style={styles.assistantLabel}>Jarvis</Text>
                  </View>
                )}
                <Text style={styles.messageText}>{msg.content}</Text>
              </View>
            ))
          )}

          {loading && (
            <View style={styles.loadingBubble}>
              <ActivityIndicator size="small" color="#E91E63" />
              <Text style={styles.loadingText}>Jarvis is thinking...</Text>
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Ask Jarvis..."
            placeholderTextColor="#666"
            value={query}
            onChangeText={setQuery}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!query.trim() || loading) && styles.sendButtonDisabled]}
            onPress={() => handleSendQuery()}
            disabled={!query.trim() || loading}
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
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#E91E63',
    fontSize: 12,
    marginTop: 2,
  },
  jarvisIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E91E6320',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 24,
  },
  welcomeContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  welcomeIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#E91E6320',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  welcomeTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  welcomeText: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 32,
    marginBottom: 32,
  },
  quickQueriesTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  quickQueriesContainer: {
    width: '100%',
    gap: 8,
  },
  quickQueryChip: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#E91E63',
  },
  quickQueryText: {
    color: '#ddd',
    fontSize: 14,
  },
  messageBubble: {
    maxWidth: '85%',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  userBubble: {
    backgroundColor: '#E91E63',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#16213e',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  assistantLabel: {
    color: '#E91E63',
    fontSize: 12,
    fontWeight: '600',
  },
  messageText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    alignSelf: 'flex-start',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  loadingText: {
    color: '#aaa',
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    backgroundColor: '#16213e',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#0f3460',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E91E63',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});

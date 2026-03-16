import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://smart-store-ai-2.preview.emergentagent.com';

export default function LoginScreen() {
  console.log('API_URL:', API_URL);
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (pin.length < 4) {
      Alert.alert('Error', 'Please enter a 4-digit PIN');
      return;
    }

    setLoading(true);
    try {
      console.log('Attempting login to:', `${API_URL}/api/auth/verify-pin?pin=${pin}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(`${API_URL}/api/auth/verify-pin?pin=${pin}`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      clearTimeout(timeoutId);
      console.log('Response status:', response.status);
      
      const data = await response.json();
      console.log('Response data:', data);

      if (response.ok && data.success) {
        // Navigate to dashboard on successful login
        router.replace('/dashboard');
      } else {
        Alert.alert('Error', data.detail || 'Invalid PIN');
      }
    } catch (error: any) {
      console.log('Login error:', error);
      if (error.name === 'AbortError') {
        Alert.alert('Connection Timeout', 'Server is taking too long. Please try again.');
      } else {
        Alert.alert('Connection Error', 'Unable to connect. Please check your internet.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <View style={styles.logoContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="storefront" size={60} color="#4CAF50" />
          </View>
          <Text style={styles.title}>Walia Brothers</Text>
          <Text style={styles.subtitle}>Smart Store Assistant</Text>
          <Text style={styles.jarvisText}>JARVIS</Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.label}>Enter PIN to Access</Text>
          <TextInput
            style={styles.input}
            placeholder="****"
            placeholderTextColor="#666"
            value={pin}
            onChangeText={setPin}
            keyboardType="numeric"
            maxLength={4}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>Unlock</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.hintText}>Default PIN: 1234</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#16213e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 3,
    borderColor: '#4CAF50',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#aaa',
    marginBottom: 8,
  },
  jarvisText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    letterSpacing: 8,
  },
  formContainer: {
    backgroundColor: '#16213e',
    borderRadius: 20,
    padding: 24,
  },
  label: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#0f3460',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 16,
    marginBottom: 24,
  },
  loginButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  hintText: {
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    fontSize: 12,
  },
});

import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import axios from 'axios';

WebBrowser.maybeCompleteAuthSession();

// ---------- CONFIG ----------
// This connects your app to your live backend on Render
const API_URL = 'https://inbox-assasin-ai.onrender.com';

const Tab = createBottomTabNavigator();

// ---------- LOGIN SCREEN ----------
function LoginScreen({ onLogin }) {
  const [loading, setLoading] = useState(false);

  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: 'YOUR_ANDROID_CLIENT_ID',
    iosClientId: 'YOUR_IOS_CLIENT_ID',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.compose'],
  });

  useEffect(() => {
    if (response?.type === 'success') {
      setLoading(true);
      const { authentication } = response;
      axios.post(`${API_URL}/api/inbox`, { user_id: 'user_123', token: JSON.stringify(authentication) })
        .then(() => {
          AsyncStorage.setItem('gmail_token', JSON.stringify(authentication));
          onLogin(authentication);
          setLoading(false);
        })
        .catch(err => {
          Alert.alert('Login Error', err.message);
          setLoading(false);
        });
    }
  }, [response]);

  return (
    <SafeAreaView style={styles.loginContainer}>
      <StatusBar barStyle="light-content" />
      <Icon name="rocket" size={80} color="#4F46E5" />
      <Text style={styles.loginTitle}>Inbox Assassin</Text>
      <Text style={styles.loginSubtitle}>AI Life Manager for Founders</Text>
      <TouchableOpacity
        style={styles.googleBtn}
        onPress={() => promptAsync()}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.googleBtnText}>🚀 Connect Gmail</Text>}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ---------- INBOX SCREEN (Tab 1) ----------
function InboxScreen({ token }) {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchInbox = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/inbox`, {
        user_id: 'user_123',
        token: JSON.stringify(token),
      });
      setEmails(res.data.emails || []);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  };

  const draftReply = async (email) => {
    try {
      const res = await axios.post(`${API_URL}/api/draft`, {
        user_id: 'user_123',
        token: JSON.stringify(token),
        email_id: email.id,
        sender: email.sender,
        subject: email.subject,
        body: email.body || email.snippet,
        tone: 'Direct & Concise',
      });
      Alert.alert('✅ Draft Saved!', 'Check your Gmail drafts.');
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  useEffect(() => {
    fetchInbox();
  }, []);

  const getPriorityColor = (p) => {
    if (p === 'Urgent') return '#EF4444';
    if (p === 'Strategic') return '#F59E0B';
    return '#9CA3AF';
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📧 Unified Inbox</Text>
        <TouchableOpacity onPress={fetchInbox}>
          <Icon name="refresh" size={24} color="#4F46E5" />
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#4F46E5" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={emails}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.emailCard}>
              <View style={styles.row}>
                <Text style={styles.subject}>{item.subject}</Text>
                <View style={[styles.badge, { backgroundColor: getPriorityColor(item.priority) + '20' }]}>
                  <Text style={[styles.badgeText, { color: getPriorityColor(item.priority) }]}>{item.priority}</Text>
                </View>
              </View>
              <Text style={styles.sender}>{item.sender}</Text>
              <Text style={styles.snippet} numberOfLines={2}>{item.snippet}</Text>
              <TouchableOpacity style={styles.draftBtn} onPress={() => draftReply(item)}>
                <Text style={styles.draftBtnText}>✍️ AI Draft Reply</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

// ---------- OTHER SCREENS (Placeholders) ----------
function CalendarScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.placeholder}>📅 Calendar Guardian</Text>
      <Text>Auto-blocking & meeting insights (Coming soon)</Text>
    </SafeAreaView>
  );
}

function FinanceScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.placeholder}>💰 Financial Radar</Text>
      <Text>Runway: 8.2 months | MRR: $12.4k (Stub)</Text>
    </SafeAreaView>
  );
}

function VibeScreen() {
  const [mood, setMood] = useState('');
  const submitVibe = async () => {
    await axios.post(`${API_URL}/api/vibe`, { user_id: 'user_123', message: mood });
    Alert.alert('Logged!', 'Your vibe is recorded.');
    setMood('');
  };
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.placeholder}>🧘 Vibe Check</Text>
      <TextInput
        style={styles.input}
        placeholder="How are you feeling today?"
        value={mood}
        onChangeText={setMood}
      />
      <TouchableOpacity style={styles.draftBtn} onPress={submitVibe}>
        <Text style={styles.draftBtnText}>Log Mood</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ---------- NAVIGATION ----------
export default function App() {
  const [token, setToken] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('gmail_token').then((t) => {
      if (t) setToken(JSON.parse(t));
    });
  }, []);

  if (!token) {
    return <LoginScreen onLogin={setToken} />;
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;
            if (route.name === 'Inbox') iconName = 'mail';
            else if (route.name === 'Calendar') iconName = 'calendar';
            else if (route.name === 'Finance') iconName = 'cash';
            else if (route.name === 'Vibe') iconName = 'heart';
            return <Icon name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: '#4F46E5',
          tabBarInactiveTintColor: 'gray',
          headerShown: false,
        })}
      >
        <Tab.Screen name="Inbox">{() => <InboxScreen token={token} />}</Tab.Screen>
        <Tab.Screen name="Calendar" component={CalendarScreen} />
        <Tab.Screen name="Finance" component={FinanceScreen} />
        <Tab.Screen name="Vibe" component={VibeScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// ---------- STYLES ----------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loginContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' },
  loginTitle: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginTop: 20 },
  loginSubtitle: { fontSize: 16, color: '#94A3B8', marginBottom: 40 },
  googleBtn: { backgroundColor: '#4F46E5', paddingVertical: 16, paddingHorizontal: 40, borderRadius: 30 },
  googleBtnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#0F172A' },
  emailCard: { backgroundColor: '#fff', marginHorizontal: 16, marginVertical: 8, padding: 16, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subject: { fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  sender: { fontSize: 14, color: '#475569', marginVertical: 4 },
  snippet: { fontSize: 14, color: '#64748B', marginBottom: 12 },
  draftBtn: { backgroundColor: '#4F46E5', padding: 10, borderRadius: 8, alignItems: 'center' },
  draftBtnText: { color: '#fff', fontWeight: '600' },
  placeholder: { fontSize: 24, fontWeight: 'bold', margin: 20, color: '#0F172A' },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 12, margin: 16, backgroundColor: '#fff' },
});
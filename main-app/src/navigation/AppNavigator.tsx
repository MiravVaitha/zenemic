import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import { useAuth } from '../lib/auth';
import { DraftProvider } from './DraftContext';
import type { RootStackParamList } from './types';

import { SplashScreen } from '../screens/SplashScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { KeyboardSetupScreen } from '../screens/KeyboardSetupScreen';
import { EventsListScreen } from '../screens/EventsListScreen';
import { EventDetailScreen } from '../screens/EventDetailScreen';
import { EventLocationsScreen } from '../screens/EventLocationsScreen';
import { EditEventScreen } from '../screens/EditEventScreen';
import { PlannerChartScreen } from '../screens/PlannerChartScreen';
import { CreateDescribeScreen } from '../screens/CreateDescribeScreen';
import { CreateConfirmScreen } from '../screens/CreateConfirmScreen';
import { CreateProcessingScreen } from '../screens/CreateProcessingScreen';
import { CreateSuccessScreen } from '../screens/CreateSuccessScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SplitterScreen } from '../screens/SplitterScreen';
import { AlbumScreen } from '../screens/AlbumScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  const t = useTheme();
  const { session, loading } = useAuth();

  const navTheme = {
    ...(t.mode === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(t.mode === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: t.bg,
      card: t.bg,
      text: t.fg,
      border: t.hairline,
      primary: t.accent,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <DraftProvider>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: t.bg },
            animation: 'slide_from_right',
          }}
        >
          {loading ? (
            // Restoring the session — show the splash; the stack swaps below once done.
            <Stack.Screen name="Splash" component={SplashScreen} options={{ animation: 'fade' }} />
          ) : !session ? (
            // Logged out.
            <Stack.Group>
              <Stack.Screen name="SignUp" component={SignUpScreen} />
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Forgot" component={ForgotPasswordScreen} />
            </Stack.Group>
          ) : (
            // Logged in.
            <Stack.Group>
              <Stack.Screen name="Events" component={EventsListScreen} />
              <Stack.Screen name="EventDetail" component={EventDetailScreen} />
              <Stack.Screen name="EventLocations" component={EventLocationsScreen} />
              <Stack.Screen name="EditEvent" component={EditEventScreen} />
              <Stack.Screen name="PlannerChart" component={PlannerChartScreen} />
              <Stack.Screen name="Splitter" component={SplitterScreen} />
              <Stack.Screen name="Album" component={AlbumScreen} />
              <Stack.Screen name="CreateDescribe" component={CreateDescribeScreen} />
              <Stack.Screen name="CreateConfirm" component={CreateConfirmScreen} />
              <Stack.Screen name="CreateProcessing" component={CreateProcessingScreen} />
              <Stack.Screen name="CreateSuccess" component={CreateSuccessScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="Keyboard" component={KeyboardSetupScreen} />
            </Stack.Group>
          )}
        </Stack.Navigator>
      </DraftProvider>
    </NavigationContainer>
  );
}

import { Audio } from 'expo-av';
import { Vibration } from 'react-native';

let sound: Audio.Sound | null = null;
let vibrateTimer: ReturnType<typeof setInterval> | null = null;

export async function startIncomingCallAlert(): Promise<void> {
  stopIncomingCallAlert();
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldDuckAndroid: false,
      staysActiveInBackground: false,
    });
    const { sound: s } = await Audio.Sound.createAsync(
      { uri: 'https://actions.google.com/sounds/v1/alarms/phone_alerts_and_rings.ogg' },
      { isLooping: true, volume: 1.0 },
    );
    sound = s;
    await s.playAsync();
  } catch {
    /* fallback rung */
  }
  Vibration.vibrate([0, 800, 400, 800, 400, 800], true);
  vibrateTimer = setInterval(() => {
    Vibration.vibrate([0, 800, 400, 800], false);
  }, 2400);
}

export async function stopIncomingCallAlert(): Promise<void> {
  if (vibrateTimer) {
    clearInterval(vibrateTimer);
    vibrateTimer = null;
  }
  try {
    Vibration.cancel();
  } catch {
    /* ignore */
  }
  if (sound) {
    try {
      await sound.stopAsync();
      await sound.unloadAsync();
    } catch {
      /* ignore */
    }
    sound = null;
  }
}

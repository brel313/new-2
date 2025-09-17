import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  FlatList,
  Image,
  SafeAreaView,
  StatusBar,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
  PermissionsAndroid,
  Switch,
  TextInput,
  Animated,
  PanGestureHandler,
  State,
  BackHandler,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');
const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  file_path: string;
  folder_path: string;
  artwork?: string;
  format: string;
  size: number;
  lyrics?: string;
  genre?: string;
  year?: number;
}

interface UserSettings {
  selected_folders: string[];
  shuffle_mode: boolean;
  repeat_mode: string;
  volume: number;
  equalizer_preset: string;
  theme_mode: 'light' | 'dark' | 'auto';
  sleep_timer: number;
}

interface FolderInfo {
  path: string;
  name: string;
  songCount: number;
  selected: boolean;
}

interface PlayHistoryItem {
  id: string;
  song: Song;
  played_at: Date;
}

interface AudioVisualizerData {
  frequency: number[];
  amplitude: number;
}

export default function MusicPlayer() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1.0);
  const [shuffleMode, setShuffleMode] = useState(true);
  const [repeatMode, setRepeatMode] = useState<'none' | 'one' | 'all'>('none');
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFolderSelection, setShowFolderSelection] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<string>('unknown');
  const [availableFolders, setAvailableFolders] = useState<FolderInfo[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState('');
  
  // New enhanced features
  const [currentView, setCurrentView] = useState<'player' | 'playlist' | 'search' | 'lyrics' | 'equalizer'>('player');
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'auto'>('dark');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [playHistory, setPlayHistory] = useState<PlayHistoryItem[]>([]);
  const [playQueue, setPlayQueue] = useState<Song[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [sleepTimer, setSleepTimer] = useState(0);
  const [sleepTimerActive, setSleepTimerActive] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showEqualizer, setShowEqualizer] = useState(false);
  const [equalizerBands, setEqualizerBands] = useState([0, 0, 0, 0, 0, 0, 0, 0]);
  const [visualizerData, setVisualizerData] = useState<AudioVisualizerData>({ frequency: [], amplitude: 0 });
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  
  // Animation values
  const albumRotation = useRef(new Animated.Value(0)).current;
  const playButtonScale = useRef(new Animated.Value(1)).current;
  const visualizerBars = useRef(Array.from({ length: 20 }, () => new Animated.Value(0.1))).current;

  const soundRef = useRef<Audio.Sound | null>(null);
  const positionUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const visualizerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    initializeApp();
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
      if (positionUpdateRef.current) {
        clearInterval(positionUpdateRef.current);
      }
    };
  }, []);

  const initializeApp = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      await requestPermissions();
      await loadSettings();
      await loadFavorites();
    } catch (error) {
      console.error('Error initializing app:', error);
      Alert.alert('Error', 'Failed to initialize music player');
    }
  };

  const requestPermissions = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setPermissionStatus(status);
      
      if (status === 'granted') {
        await scanForMusic();
      } else {
        Alert.alert(
          'Permisos Requeridos',
          'Esta app necesita acceso a tu música para funcionar.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Solicitar Permisos', onPress: requestPermissions },
          ]
        );
      }
    } catch (error) {
      console.error('Error requesting permissions:', error);
      Alert.alert('Error', 'Failed to request permissions');
    }
  };

  const scanForMusic = async () => {
    try {
      setIsScanning(true);
      setIsLoading(true);
      setScanProgress('Iniciando escaneo...');
      console.log('Scanning for music...');

      // First, get all audio assets
      let allAssets: MediaLibrary.Asset[] = [];
      let hasNextPage = true;
      let endCursor: string | undefined;

      while (hasNextPage) {
        const media = await MediaLibrary.getAssetsAsync({
          mediaType: 'audio',
          first: 100,
          after: endCursor,
          sortBy: 'creationTime',
        });

        allAssets.push(...media.assets);
        hasNextPage = media.hasNextPage;
        endCursor = media.endCursor;
        
        setScanProgress(`Encontrados ${allAssets.length} archivos de audio...`);
      }

      console.log(`Found ${allAssets.length} audio files`);

      const folderMap = new Map<string, { songs: Song[], count: number }>();
      const musicFiles: Song[] = [];

      for (let i = 0; i < allAssets.length; i++) {
        const asset = allAssets[i];
        setScanProgress(`Procesando ${i + 1}/${allAssets.length} archivos...`);
        
        try {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
          const folderPath = assetInfo.localUri?.split('/').slice(0, -1).join('/') || '';
          const folderName = folderPath.split('/').pop() || 'Root';

          const song: Song = {
            id: asset.id,
            title: asset.filename.replace(/\.[^/.]+$/, ''),
            artist: 'Artista Desconocido',
            album: 'Álbum Desconocido',
            duration: Math.floor(asset.duration),
            file_path: assetInfo.localUri || asset.uri,
            folder_path: folderPath,
            format: asset.filename.split('.').pop() || '',
            size: 0,
          };

          musicFiles.push(song);

          // Group by folder
          if (!folderMap.has(folderPath)) {
            folderMap.set(folderPath, { songs: [], count: 0 });
          }
          folderMap.get(folderPath)!.songs.push(song);
          folderMap.get(folderPath)!.count++;

          // Save to backend
          try {
            await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/songs`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                title: song.title,
                artist: song.artist,
                album: song.album,
                duration: song.duration,
                file_path: song.file_path,
                folder_path: song.folder_path,
                format: song.format,
                size: song.size,
              }),
            });
          } catch (error) {
            console.log('Error saving song to database:', error);
          }
        } catch (error) {
          console.log('Error processing asset:', error);
        }
      }

      // Create folder info array
      const folders: FolderInfo[] = Array.from(folderMap.entries()).map(([path, data]) => ({
        path,
        name: path.split('/').pop() || 'Root',
        songCount: data.count,
        selected: true, // Select all folders by default
      }));

      setSongs(musicFiles);
      setAvailableFolders(folders);
      setSelectedFolders(folders.map(f => f.path));

      setScanProgress(`Escaneo completado: ${musicFiles.length} canciones en ${folders.length} carpetas`);

      if (musicFiles.length > 0) {
        await playRandomSong(musicFiles);
      } else {
        Alert.alert('No se encontró música', 'No se encontraron archivos de música en tu dispositivo.');
      }

      setTimeout(() => {
        setIsScanning(false);
        setIsLoading(false);
      }, 2000);

    } catch (error) {
      console.error('Error scanning for music:', error);
      setIsScanning(false);
      setIsLoading(false);
      Alert.alert('Error', 'Failed to scan for music files');
    }
  };

  const playRandomSong = async (songList?: Song[]) => {
    try {
      const availableSongs = songList || getFilteredSongs();
      if (availableSongs.length === 0) {
        Alert.alert('No Music', 'No music files found in selected folders');
        return;
      }

      const randomIndex = Math.floor(Math.random() * availableSongs.length);
      const randomSong = availableSongs[randomIndex];
      
      await playSong(randomSong);
    } catch (error) {
      console.error('Error playing random song:', error);
      Alert.alert('Error', 'Failed to play random song');
    }
  };

  const playSong = async (song: Song) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      setIsLoading(true);
      setCurrentSong(song);

      // Add haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: song.file_path },
        { 
          shouldPlay: true,
          volume: volume,
          isLooping: repeatMode === 'one',
        }
      );

      soundRef.current = newSound;
      setSound(newSound);
      setIsPlaying(true);
      setIsLoading(false);

      // Start animations and visualizer
      startAlbumRotation();
      startVisualizer();
      animatePlayButton();

      // Add to play history
      await addToPlayHistory(song);

      newSound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (status.isLoaded) {
          setPosition(status.positionMillis || 0);
          setDuration(status.durationMillis || 0);
          
          if (status.didJustFinish && !status.isLooping) {
            handleSongEnd();
          }
        }
      });

      // Save play history to backend
      try {
        await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/play-history`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            song_id: song.id,
            played_at: new Date().toISOString(),
          }),
        });
      } catch (error) {
        console.log('Error saving play history to backend:', error);
      }

    } catch (error) {
      console.error('Error playing song:', error);
      setIsLoading(false);
      Alert.alert('Error', 'No se pudo reproducir la canción');
    }
  };

  const handleSongEnd = async () => {
    if (repeatMode === 'one') {
      return; // Song will loop automatically
    }

    if (repeatMode === 'all' || shuffleMode) {
      await playRandomSong();
    } else {
      setIsPlaying(false);
    }
  };

  const togglePlayPause = async () => {
    try {
      if (!soundRef.current) return;

      if (isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error toggling play/pause:', error);
    }
  };

  const skipToNext = async () => {
    await playRandomSong();
  };

  const skipToPrevious = async () => {
    if (position > 5000) {
      // If more than 5 seconds played, restart current song
      if (soundRef.current) {
        await soundRef.current.setPositionAsync(0);
      }
    } else {
      await playRandomSong();
    }
  };

  const toggleShuffle = async () => {
    const newShuffleMode = !shuffleMode;
    setShuffleMode(newShuffleMode);
    await saveSettings({ shuffle_mode: newShuffleMode });
  };

  const toggleRepeat = async () => {
    const modes: ('none' | 'one' | 'all')[] = ['none', 'one', 'all'];
    const currentIndex = modes.indexOf(repeatMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    setRepeatMode(nextMode);
    
    if (soundRef.current) {
      await soundRef.current.setIsLoopingAsync(nextMode === 'one');
    }
    
    await saveSettings({ repeat_mode: nextMode });
  };

  const handleVolumeChange = async (value: number) => {
    setVolume(value);
    if (soundRef.current) {
      await soundRef.current.setVolumeAsync(value);
    }
    await saveSettings({ volume: value });
  };

  const handleSeek = async (value: number) => {
    if (soundRef.current && duration > 0) {
      const seekPosition = (value / 100) * duration;
      await soundRef.current.setPositionAsync(seekPosition);
      setPosition(seekPosition);
    }
  };

  const toggleFavorite = async (songId: string) => {
    try {
      const isFavorite = favorites.includes(songId);
      
      if (isFavorite) {
        await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/favorites/${songId}`, {
          method: 'DELETE',
        });
        setFavorites(favorites.filter(id => id !== songId));
      } else {
        await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/favorites`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ song_id: songId }),
        });
        setFavorites([...favorites, songId]);
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const toggleFolderSelection = (folderPath: string) => {
    const updatedFolders = availableFolders.map(folder =>
      folder.path === folderPath ? { ...folder, selected: !folder.selected } : folder
    );
    setAvailableFolders(updatedFolders);
    
    const newSelectedFolders = updatedFolders
      .filter(folder => folder.selected)
      .map(folder => folder.path);
    
    setSelectedFolders(newSelectedFolders);
    saveSettings({ selected_folders: newSelectedFolders });
  };

  const selectAllFolders = () => {
    const updatedFolders = availableFolders.map(folder => ({ ...folder, selected: true }));
    setAvailableFolders(updatedFolders);
    const allFolderPaths = updatedFolders.map(folder => folder.path);
    setSelectedFolders(allFolderPaths);
    saveSettings({ selected_folders: allFolderPaths });
  };

  const deselectAllFolders = () => {
    const updatedFolders = availableFolders.map(folder => ({ ...folder, selected: false }));
    setAvailableFolders(updatedFolders);
    setSelectedFolders([]);
    saveSettings({ selected_folders: [] });
  };

  const loadSettings = async () => {
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/settings`);
      if (response.ok) {
        const settings: UserSettings = await response.json();
        setSelectedFolders(settings.selected_folders);
        setShuffleMode(settings.shuffle_mode);
        setRepeatMode(settings.repeat_mode as 'none' | 'one' | 'all');
        setVolume(settings.volume);
      }
    } catch (error) {
      console.log('Error loading settings:', error);
    }
  };

  const saveSettings = async (updates: Partial<UserSettings>) => {
    try {
      await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
    } catch (error) {
      console.log('Error saving settings:', error);
    }
  };

  const loadFavorites = async () => {
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/favorites`);
      if (response.ok) {
        const favoritesData = await response.json();
        setFavorites(favoritesData.map((fav: any) => fav.song_id));
      }
    } catch (error) {
      console.log('Error loading favorites:', error);
    }
  };

  // Enhanced features functions
  const startAlbumRotation = () => {
    albumRotation.setValue(0);
    Animated.loop(
      Animated.timing(albumRotation, {
        toValue: 1,
        duration: 20000,
        useNativeDriver: true,
      })
    ).start();
  };

  const stopAlbumRotation = () => {
    albumRotation.stopAnimation();
  };

  const animatePlayButton = () => {
    Animated.sequence([
      Animated.timing(playButtonScale, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(playButtonScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const startVisualizer = () => {
    visualizerRef.current = setInterval(() => {
      visualizerBars.forEach((bar, index) => {
        const randomHeight = Math.random() * 0.8 + 0.2;
        Animated.timing(bar, {
          toValue: randomHeight,
          duration: 150 + Math.random() * 100,
          useNativeDriver: false,
        }).start();
      });
      
      // Update visualizer data
      setVisualizerData({
        frequency: Array.from({ length: 20 }, () => Math.random() * 100),
        amplitude: Math.random() * 100,
      });
    }, 200);
  };

  const stopVisualizer = () => {
    if (visualizerRef.current) {
      clearInterval(visualizerRef.current);
      visualizerRef.current = null;
    }
    visualizerBars.forEach(bar => {
      Animated.timing(bar, {
        toValue: 0.1,
        duration: 300,
        useNativeDriver: false,
      }).start();
    });
  };

  const searchSongs = (query: string) => {
    setSearchQuery(query);
    if (query.trim() === '') {
      setSearchResults([]);
      return;
    }

    const filteredSongs = songs.filter(song =>
      song.title.toLowerCase().includes(query.toLowerCase()) ||
      song.artist.toLowerCase().includes(query.toLowerCase()) ||
      song.album.toLowerCase().includes(query.toLowerCase())
    );
    setSearchResults(filteredSongs);
  };

  const addToPlayHistory = async (song: Song) => {
    const historyItem: PlayHistoryItem = {
      id: Date.now().toString(),
      song,
      played_at: new Date(),
    };

    const newHistory = [historyItem, ...playHistory.slice(0, 49)]; // Keep last 50
    setPlayHistory(newHistory);
    
    try {
      await AsyncStorage.setItem('playHistory', JSON.stringify(newHistory));
    } catch (error) {
      console.error('Error saving play history:', error);
    }
  };

  const startSleepTimer = (minutes: number) => {
    setSleepTimer(minutes);
    setSleepTimerActive(true);
    
    sleepTimerRef.current = setTimeout(() => {
      pauseMusic();
      setSleepTimerActive(false);
      setSleepTimer(0);
      Alert.alert('Temporizador', 'La música se pausó automáticamente');
    }, minutes * 60 * 1000);
  };

  const cancelSleepTimer = () => {
    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    setSleepTimerActive(false);
    setSleepTimer(0);
  };

  const pauseMusic = async () => {
    try {
      if (soundRef.current && isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
        stopAlbumRotation();
        stopVisualizer();
      }
    } catch (error) {
      console.error('Error pausing music:', error);
    }
  };

  const updateEqualizer = (bandIndex: number, value: number) => {
    const newBands = [...equalizerBands];
    newBands[bandIndex] = value;
    setEqualizerBands(newBands);
    
    // Note: In a real app, you'd apply these values to an audio processor
    // For now, we'll just store the values
    AsyncStorage.setItem('equalizerBands', JSON.stringify(newBands));
  };

  const applyEqualizerPreset = (preset: string) => {
    let bands: number[] = [];
    
    switch (preset) {
      case 'rock':
        bands = [3, 2, -1, -2, 1, 2, 3, 4];
        break;
      case 'pop':
        bands = [1, 2, 3, 2, 0, -1, -1, 1];
        break;
      case 'jazz':
        bands = [2, 1, 0, 1, 2, 2, 1, 0];
        break;
      case 'classical':
        bands = [3, 2, 1, 0, -1, -1, 0, 1];
        break;
      case 'bass_boost':
        bands = [4, 3, 2, 1, 0, 0, 0, 0];
        break;
      default:
        bands = [0, 0, 0, 0, 0, 0, 0, 0];
    }
    
    setEqualizerBands(bands);
    AsyncStorage.setItem('equalizerBands', JSON.stringify(bands));
  };

  const addToQueue = (song: Song) => {
    const newQueue = [...playQueue, song];
    setPlayQueue(newQueue);
    Alert.alert('Agregado', `"${song.title}" agregada a la cola`);
  };

  const playFromQueue = async (index: number) => {
    const song = playQueue[index];
    if (song) {
      await playSong(song);
      setCurrentQueueIndex(index);
    }
  };

  const removeFromQueue = (index: number) => {
    const newQueue = playQueue.filter((_, i) => i !== index);
    setPlayQueue(newQueue);
    if (currentQueueIndex > index) {
      setCurrentQueueIndex(currentQueueIndex - 1);
    }
  };

  const getThemeColors = () => {
    if (themeMode === 'light') {
      return {
        background: '#F5F5F5',
        surface: '#FFFFFF',
        text: '#1A1A1A',
        textSecondary: '#666666',
        accent: '#FF6B35',
        accentLight: 'rgba(255, 107, 53, 0.1)',
      };
    } else {
      return {
        background: '#1A1A1A',
        surface: '#2A2A2A',
        text: '#FFFFFF',
        textSecondary: '#CCCCCC',
        accent: '#FF6B35',
        accentLight: 'rgba(255, 107, 53, 0.2)',
      };
    }
  };

  // Existing functions below this line...
    return songs.filter(song => 
      selectedFolders.length === 0 || selectedFolders.includes(song.folder_path)
    );
  };

  const formatTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getRepeatIcon = () => {
    switch (repeatMode) {
      case 'one': return 'repeat-outline';
      case 'all': return 'repeat';
      default: return 'repeat-outline';
    }
  };

  const renderSongItem = ({ item }: { item: Song }) => (
    <TouchableOpacity
      style={[
        styles.songItem,
        currentSong?.id === item.id && styles.currentSongItem
      ]}
      onPress={() => playSong(item)}
    >
      <View style={styles.songInfo}>
        <Text style={styles.songTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.songArtist} numberOfLines={1}>
          {item.artist} • {item.album}
        </Text>
        <Text style={styles.songDuration}>
          {formatTime(item.duration * 1000)}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.favoriteButton}
        onPress={() => toggleFavorite(item.id)}
      >
        <Ionicons
          name={favorites.includes(item.id) ? 'heart' : 'heart-outline'}
          size={24}
          color={favorites.includes(item.id) ? '#FF6B35' : '#666'}
        />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderFolderItem = ({ item }: { item: FolderInfo }) => (
    <View style={styles.folderItem}>
      <View style={styles.folderInfo}>
        <Text style={styles.folderName}>{item.name}</Text>
        <Text style={styles.folderPath}>{item.path}</Text>
        <Text style={styles.folderCount}>{item.songCount} canciones</Text>
      </View>
      <Switch
        value={item.selected}
        onValueChange={() => toggleFolderSelection(item.path)}
        trackColor={{ false: '#666', true: '#FF6B35' }}
        thumbColor={item.selected ? '#FFF' : '#CCC'}
      />
    </View>
  );

  if (permissionStatus !== 'granted') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
        <View style={styles.permissionContainer}>
          <Ionicons name="musical-notes" size={100} color="#FF6B35" />
          <Text style={styles.permissionTitle}>Reproductor de Música</Text>
          <Text style={styles.permissionText}>
            Necesitamos acceso a tus archivos de música para reproducir tu música favorita.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermissions}>
            <Text style={styles.permissionButtonText}>Conceder Permisos</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setShowSettings(true)}>
          <Ionicons name="settings-outline" size={24} color="#FF6B35" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reproductor de Música</Text>
        <TouchableOpacity onPress={() => setShowPlaylist(true)}>
          <Ionicons name="list-outline" size={24} color="#FF6B35" />
        </TouchableOpacity>
      </View>

      {/* Main Player */}
      <View style={styles.playerContainer}>
        {currentSong ? (
          <React.Fragment>
            {/* Album Art */}
            <View style={styles.albumArtContainer}>
              {currentSong.artwork ? (
                <Image source={{ uri: currentSong.artwork }} style={styles.albumArt} />
              ) : (
                <View style={styles.albumArtPlaceholder}>
                  <Ionicons name="musical-notes" size={80} color="#FF6B35" />
                </View>
              )}
            </View>

            {/* Song Info */}
            <View style={styles.songInfoContainer}>
              <Text style={styles.currentSongTitle} numberOfLines={2}>
                {currentSong.title}
              </Text>
              <Text style={styles.currentSongArtist} numberOfLines={1}>
                {currentSong.artist}
              </Text>
            </View>

            {/* Progress Slider */}
            <View style={styles.progressContainer}>
              <Text style={styles.timeText}>{formatTime(position)}</Text>
              <Slider
                style={styles.progressSlider}
                minimumValue={0}
                maximumValue={100}
                value={duration > 0 ? (position / duration) * 100 : 0}
                onSlidingComplete={handleSeek}
                minimumTrackTintColor="#FF6B35"
                maximumTrackTintColor="#444"
                thumbStyle={{ backgroundColor: '#FF6B35' }}
              />
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>

            {/* Controls */}
            <View style={styles.controlsContainer}>
              <TouchableOpacity
                style={[styles.controlButton, shuffleMode && styles.activeControl]}
                onPress={toggleShuffle}
              >
                <Ionicons name="shuffle" size={24} color={shuffleMode ? '#FF6B35' : '#666'} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.controlButton} onPress={skipToPrevious}>
                <Ionicons name="play-skip-back" size={32} color="#FFF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.playButton}
                onPress={togglePlayPause}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="large" color="#FFF" />
                ) : (
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={40}
                    color="#FFF"
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.controlButton} onPress={skipToNext}>
                <Ionicons name="play-skip-forward" size={32} color="#FFF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.controlButton, repeatMode !== 'none' && styles.activeControl]}
                onPress={toggleRepeat}
              >
                <Ionicons
                  name={getRepeatIcon()}
                  size={24}
                  color={repeatMode !== 'none' ? '#FF6B35' : '#666'}
                />
              </TouchableOpacity>
            </View>

            {/* Volume Control */}
            <View style={styles.volumeContainer}>
              <Ionicons name="volume-low" size={20} color="#666" />
              <Slider
                style={styles.volumeSlider}
                minimumValue={0}
                maximumValue={1}
                value={volume}
                onValueChange={handleVolumeChange}
                minimumTrackTintColor="#FF6B35"
                maximumTrackTintColor="#444"
                thumbStyle={{ backgroundColor: '#FF6B35' }}
              />
              <Ionicons name="volume-high" size={20} color="#666" />
            </View>
          </React.Fragment>
        ) : (
          <View style={styles.noMusicContainer}>
            <Ionicons name="musical-notes-outline" size={100} color="#666" />
            <Text style={styles.noMusicText}>No hay música reproduciéndose</Text>
            {songs.length > 0 && (
              <TouchableOpacity style={styles.playRandomButton} onPress={() => playRandomSong()}>
                <Text style={styles.playRandomButtonText}>Reproducir Música Aleatoria</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Loading Overlay */}
      {(isLoading || isScanning) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FF6B35" />
          <Text style={styles.loadingText}>
            {isScanning ? scanProgress : 'Cargando...'}
          </Text>
        </View>
      )}

      {/* Playlist Modal */}
      <Modal
        visible={showPlaylist}
        animationType="slide"
        presentationStyle="formSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Lista de Canciones ({getFilteredSongs().length})
            </Text>
            <TouchableOpacity onPress={() => setShowPlaylist(false)}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={getFilteredSongs()}
            keyExtractor={(item) => item.id}
            renderItem={renderSongItem}
            style={styles.songList}
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <Ionicons name="musical-notes-outline" size={60} color="#666" />
                <Text style={styles.emptyListText}>No hay canciones en las carpetas seleccionadas</Text>
                <TouchableOpacity 
                  style={styles.emptyListButton} 
                  onPress={() => setShowFolderSelection(true)}
                >
                  <Text style={styles.emptyListButtonText}>Seleccionar Carpetas</Text>
                </TouchableOpacity>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

      {/* Folder Selection Modal */}
      <Modal
        visible={showFolderSelection}
        animationType="slide"
        presentationStyle="formSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Seleccionar Carpetas</Text>
            <TouchableOpacity onPress={() => setShowFolderSelection(false)}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.folderActions}>
            <TouchableOpacity style={styles.folderActionButton} onPress={selectAllFolders}>
              <Text style={styles.folderActionText}>Seleccionar Todas</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.folderActionButton} onPress={deselectAllFolders}>
              <Text style={styles.folderActionText}>Deseleccionar Todas</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={availableFolders}
            keyExtractor={(item) => item.path}
            renderItem={renderFolderItem}
            style={styles.folderList}
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <Ionicons name="folder-outline" size={60} color="#666" />
                <Text style={styles.emptyListText}>No se encontraron carpetas</Text>
                <TouchableOpacity 
                  style={styles.emptyListButton} 
                  onPress={scanForMusic}
                >
                  <Text style={styles.emptyListButtonText}>Escanear Música</Text>
                </TouchableOpacity>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        animationType="slide"
        presentationStyle="formSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Configuración</Text>
            <TouchableOpacity onPress={() => setShowSettings(false)}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.settingsContainer}>
            <Text style={styles.settingsSection}>Música</Text>
            
            <TouchableOpacity style={styles.settingsButton} onPress={scanForMusic}>
              <Ionicons name="refresh" size={20} color="#FF6B35" />
              <Text style={styles.settingsButtonText}>Escanear Nueva Música</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.settingsButton} 
              onPress={() => setShowFolderSelection(true)}
            >
              <Ionicons name="folder" size={20} color="#FF6B35" />
              <Text style={styles.settingsButtonText}>Seleccionar Carpetas</Text>
            </TouchableOpacity>
            
            <Text style={styles.statsText}>
              {songs.length} canciones encontradas
            </Text>
            <Text style={styles.statsText}>
              {availableFolders.length} carpetas disponibles
            </Text>
            <Text style={styles.statsText}>
              {selectedFolders.length} carpetas seleccionadas
            </Text>
            <Text style={styles.statsText}>
              {getFilteredSongs().length} canciones en carpetas seleccionadas
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 20,
    marginBottom: 10,
  },
  permissionText: {
    fontSize: 16,
    color: '#CCC',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  permissionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  playerContainer: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumArtContainer: {
    width: width * 0.7,
    height: width * 0.7,
    marginBottom: 30,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  albumArt: {
    width: '100%',
    height: '100%',
  },
  albumArtPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  songInfoContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  currentSongTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 5,
  },
  currentSongArtist: {
    fontSize: 18,
    color: '#CCC',
    textAlign: 'center',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 30,
  },
  progressSlider: {
    flex: 1,
    height: 40,
    marginHorizontal: 10,
  },
  timeText: {
    color: '#CCC',
    fontSize: 14,
    minWidth: 45,
    textAlign: 'center',
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 30,
  },
  controlButton: {
    padding: 10,
  },
  activeControl: {
    backgroundColor: 'rgba(255, 107, 53, 0.2)',
    borderRadius: 25,
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  volumeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  volumeSlider: {
    flex: 1,
    height: 40,
    marginHorizontal: 15,
  },
  noMusicContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  noMusicText: {
    fontSize: 18,
    color: '#666',
    marginTop: 20,
    textAlign: 'center',
  },
  playRandomButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    marginTop: 20,
  },
  playRandomButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(26, 26, 26, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#FFF',
    fontSize: 16,
    marginTop: 10,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  songList: {
    flex: 1,
  },
  songItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  currentSongItem: {
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  songArtist: {
    color: '#CCC',
    fontSize: 14,
    marginBottom: 2,
  },
  songDuration: {
    color: '#666',
    fontSize: 12,
  },
  favoriteButton: {
    padding: 10,
  },
  folderList: {
    flex: 1,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  folderInfo: {
    flex: 1,
  },
  folderName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  folderPath: {
    color: '#CCC',
    fontSize: 12,
    marginBottom: 2,
  },
  folderCount: {
    color: '#666',
    fontSize: 12,
  },
  folderActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  folderActionButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  folderActionText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyList: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyListText: {
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  emptyListButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  emptyListButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  settingsContainer: {
    flex: 1,
    padding: 20,
  },
  settingsSection: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    marginTop: 10,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  settingsButtonText: {
    color: '#FFF',
    fontSize: 16,
    marginLeft: 10,
  },
  statsText: {
    color: '#CCC',
    fontSize: 14,
    marginBottom: 5,
  },
});
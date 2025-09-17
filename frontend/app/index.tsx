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
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
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

export default function MusicPlayer() {
  // Basic states
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
  
  // Enhanced features states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [playHistory, setPlayHistory] = useState<PlayHistoryItem[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [sleepTimer, setSleepTimer] = useState(0);
  const [sleepTimerActive, setSleepTimerActive] = useState(false);
  const [equalizerBands, setEqualizerBands] = useState([0, 0, 0, 0, 0, 0, 0, 0]);
  
  // Animation refs
  const albumRotation = useRef(new Animated.Value(0)).current;
  const playButtonScale = useRef(new Animated.Value(1)).current;
  const visualizerBars = useRef(Array.from({ length: 20 }, () => new Animated.Value(0.1))).current;

  // Sound refs
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
      if (sleepTimerRef.current) {
        clearTimeout(sleepTimerRef.current);
      }
      if (visualizerRef.current) {
        clearInterval(visualizerRef.current);
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

  // Enhanced animation functions
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
      visualizerBars.forEach((bar) => {
        const randomHeight = Math.random() * 0.8 + 0.2;
        Animated.timing(bar, {
          toValue: randomHeight,
          duration: 150 + Math.random() * 100,
          useNativeDriver: false,
        }).start();
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

  const addToPlayHistory = async (song: Song) => {
    const historyItem: PlayHistoryItem = {
      id: Date.now().toString(),
      song,
      played_at: new Date(),
    };

    const newHistory = [historyItem, ...playHistory.slice(0, 49)];
    setPlayHistory(newHistory);
    
    try {
      await AsyncStorage.setItem('playHistory', JSON.stringify(newHistory));
    } catch (error) {
      console.error('Error saving play history:', error);
    }
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

      const folderMap = new Map<string, { songs: Song[], count: number }>();
      const musicFiles: Song[] = [];

      for (let i = 0; i < allAssets.length; i++) {
        const asset = allAssets[i];
        setScanProgress(`Procesando ${i + 1}/${allAssets.length} archivos...`);
        
        try {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
          const folderPath = assetInfo.localUri?.split('/').slice(0, -1).join('/') || '';
          
          const song: Song = {
            id: asset.id,
            title: asset.filename.replace(/\.[^/.]+$/, ""),
            artist: 'Artista Desconocido',
            album: 'Álbum Desconocido',
            duration: asset.duration * 1000,
            file_path: assetInfo.localUri || asset.uri,
            folder_path: folderPath,
            format: asset.filename.split('.').pop()?.toLowerCase() || 'unknown',
            size: assetInfo.mediaType ? 0 : 0,
          };

          musicFiles.push(song);

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

      const folders: FolderInfo[] = Array.from(folderMap.entries()).map(([path, data]) => ({
        path,
        name: path.split('/').pop() || 'Root',
        songCount: data.count,
        selected: true,
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

  const getFilteredSongs = () => {
    return songs.filter(song => selectedFolders.includes(song.folder_path));
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
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (error) {
        console.log('Haptic feedback not available');
      }

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

      // Start animations
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
    if (repeatMode === 'all' || shuffleMode) {
      await playRandomSong();
    } else {
      setIsPlaying(false);
      stopAlbumRotation();
      stopVisualizer();
    }
  };

  const togglePlayPause = async () => {
    try {
      if (!soundRef.current) return;

      // Add haptic feedback
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (error) {
        console.log('Haptic feedback not available');
      }
      
      animatePlayButton();

      if (isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
        stopAlbumRotation();
        stopVisualizer();
      } else {
        await soundRef.current.playAsync();
        setIsPlaying(true);
        startAlbumRotation();
        startVisualizer();
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

  const toggleFavorite = async (songId: string) => {
    try {
      const isFavorite = favorites.includes(songId);
      
      if (isFavorite) {
        const newFavorites = favorites.filter(id => id !== songId);
        setFavorites(newFavorites);
        await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/favorites/${songId}`, {
          method: 'DELETE',
        });
      } else {
        const newFavorites = [...favorites, songId];
        setFavorites(newFavorites);
        await fetch(`${EXPO_PUBLIC_BACKEND_URL}/api/favorites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ song_id: songId }),
        });
      }
      
      await AsyncStorage.setItem('favorites', JSON.stringify(favorites));
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
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

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const loadSettings = async () => {
    try {
      const settingsString = await AsyncStorage.getItem('settings');
      if (settingsString) {
        const settings: UserSettings = JSON.parse(settingsString);
        setSelectedFolders(settings.selected_folders || []);
        setShuffleMode(settings.shuffle_mode || true);
        setRepeatMode(settings.repeat_mode as 'none' | 'one' | 'all' || 'none');
        setVolume(settings.volume || 1.0);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const saveSettings = async (newSettings: Partial<UserSettings>) => {
    try {
      const existingSettings = await AsyncStorage.getItem('settings');
      const settings = existingSettings ? JSON.parse(existingSettings) : {};
      const updatedSettings = { ...settings, ...newSettings };
      await AsyncStorage.setItem('settings', JSON.stringify(updatedSettings));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  const loadFavorites = async () => {
    try {
      const favoritesString = await AsyncStorage.getItem('favorites');
      if (favoritesString) {
        setFavorites(JSON.parse(favoritesString));
      }
    } catch (error) {
      console.log('Error loading favorites:', error);
    }
  };

  const toggleFolderSelection = (folderPath: string) => {
    const isSelected = selectedFolders.includes(folderPath);
    let newSelectedFolders: string[];
    
    if (isSelected) {
      newSelectedFolders = selectedFolders.filter(path => path !== folderPath);
    } else {
      newSelectedFolders = [...selectedFolders, folderPath];
    }
    
    setSelectedFolders(newSelectedFolders);
    setAvailableFolders(prev => 
      prev.map(folder => 
        folder.path === folderPath 
          ? { ...folder, selected: !isSelected }
          : folder
      )
    );
    
    saveSettings({ selected_folders: newSelectedFolders });
  };

  // Render functions
  const renderSongItem = ({ item }: { item: Song }) => (
    <TouchableOpacity style={styles.songItem} onPress={() => playSong(item)}>
      <View style={styles.songInfo}>
        <Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.songArtist} numberOfLines={1}>{item.artist}</Text>
        <Text style={styles.songDuration}>{formatTime(item.duration)}</Text>
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

  const renderVisualizer = () => (
    <View style={styles.visualizerContainer}>
      {visualizerBars.map((bar, index) => (
        <Animated.View
          key={index}
          style={[
            styles.visualizerBar,
            {
              height: bar.interpolate({
                inputRange: [0, 1],
                outputRange: [2, 40],
              }),
            },
          ]}
        />
      ))}
    </View>
  );

  // Permission check inside the component
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
      
      {/* Enhanced Header with Search */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setShowSettings(true)}>
          <Ionicons name="settings-outline" size={24} color="#FF6B35" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🎵 Reproductor Pro</Text>
        <TouchableOpacity onPress={() => setShowSearch(!showSearch)}>
          <Ionicons name="search-outline" size={24} color="#FF6B35" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      {showSearch && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar canciones, artistas, álbumes..."
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={searchSongs}
            autoFocus
          />
        </View>
      )}

      {/* Main Player Container */}
      <View style={styles.playerContainer}>
        {/* Enhanced Album Art with Animation */}
        <View style={styles.albumArtContainer}>
          <Animated.View
            style={[
              styles.albumArtWrapper,
              {
                transform: [{
                  rotate: albumRotation.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg'],
                  }),
                }],
              },
            ]}
          >
            {currentSong?.artwork ? (
              <Image source={{ uri: currentSong.artwork }} style={styles.albumArt} />
            ) : (
              <LinearGradient
                colors={['#FF6B35', '#FF8C69']}
                style={styles.albumArtPlaceholder}
              >
                <Ionicons name="musical-notes" size={80} color="#FFF" />
              </LinearGradient>
            )}
          </Animated.View>
        </View>

        {/* Enhanced Song Info */}
        <View style={styles.songInfoContainer}>
          <Text style={styles.currentSongTitle} numberOfLines={2}>
            {currentSong?.title || 'Sin canción seleccionada'}
          </Text>
          <Text style={styles.currentSongArtist} numberOfLines={1}>
            {currentSong?.artist || 'Artista desconocido'}
          </Text>
          {currentSong?.album && (
            <Text style={styles.currentSongAlbum} numberOfLines={1}>
              {currentSong.album}
            </Text>
          )}
        </View>

        {/* Audio Visualizer */}
        {isPlaying && renderVisualizer()}

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Slider
            style={styles.progressSlider}
            minimumValue={0}
            maximumValue={100}
            value={duration > 0 ? (position / duration) * 100 : 0}
            onSlidingComplete={handleSeek}
            minimumTrackTintColor="#FF6B35"
            maximumTrackTintColor="#666"
            thumbStyle={{ backgroundColor: '#FF6B35' }}
          />
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>

        {/* Enhanced Controls */}
        <View style={styles.controlsContainer}>
          <TouchableOpacity 
            style={[styles.controlButton, shuffleMode && styles.activeControl]} 
            onPress={toggleShuffle}
          >
            <Ionicons name="shuffle" size={24} color={shuffleMode ? '#FF6B35' : '#CCC'} />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.controlButton} onPress={skipToPrevious}>
            <Ionicons name="play-skip-back" size={32} color="#CCC" />
          </TouchableOpacity>
          
          <Animated.View style={{ transform: [{ scale: playButtonScale }] }}>
            <TouchableOpacity style={styles.playButton} onPress={togglePlayPause}>
              {isLoading ? (
                <ActivityIndicator size="large" color="#FFF" />
              ) : (
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={40} color="#FFF" />
              )}
            </TouchableOpacity>
          </Animated.View>
          
          <TouchableOpacity style={styles.controlButton} onPress={skipToNext}>
            <Ionicons name="play-skip-forward" size={32} color="#CCC" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.controlButton, repeatMode !== 'none' && styles.activeControl]} 
            onPress={toggleRepeat}
          >
            <Ionicons 
              name={repeatMode === 'one' ? 'repeat' : 'repeat'} 
              size={24} 
              color={repeatMode !== 'none' ? '#FF6B35' : '#CCC'} 
            />
          </TouchableOpacity>
        </View>

        {/* Volume Control */}
        <View style={styles.volumeContainer}>
          <Ionicons name="volume-low" size={20} color="#CCC" />
          <Slider
            style={styles.volumeSlider}
            minimumValue={0}
            maximumValue={1}
            value={volume}
            onValueChange={handleVolumeChange}
            minimumTrackTintColor="#FF6B35"
            maximumTrackTintColor="#666"
            thumbStyle={{ backgroundColor: '#FF6B35' }}
          />
          <Ionicons name="volume-high" size={20} color="#CCC" />
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActionsContainer}>
          <TouchableOpacity 
            style={styles.quickActionButton} 
            onPress={() => setShowPlaylist(true)}
          >
            <Ionicons name="list" size={20} color="#FF6B35" />
            <Text style={styles.quickActionText}>Lista</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.quickActionButton} 
            onPress={() => currentSong && toggleFavorite(currentSong.id)}
          >
            <Ionicons 
              name={currentSong && favorites.includes(currentSong.id) ? 'heart' : 'heart-outline'} 
              size={20} 
              color="#FF6B35" 
            />
            <Text style={styles.quickActionText}>Favorito</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.quickActionButton} 
            onPress={() => setShowLyrics(true)}
          >
            <Ionicons name="document-text" size={20} color="#FF6B35" />
            <Text style={styles.quickActionText}>Letras</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Enhanced Playlist Modal */}
      <Modal
        visible={showPlaylist}
        animationType="slide"
        presentationStyle="formSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {searchQuery ? `Resultados: ${searchResults.length}` : `Canciones: ${getFilteredSongs().length}`}
            </Text>
            <TouchableOpacity onPress={() => setShowPlaylist(false)}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={searchQuery ? searchResults : getFilteredSongs()}
            keyExtractor={(item) => item.id}
            renderItem={renderSongItem}
            style={styles.songList}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <Ionicons name="musical-notes-outline" size={64} color="#666" />
                <Text style={styles.emptyListText}>
                  {searchQuery ? 'No se encontraron resultados' : 'No hay canciones en las carpetas seleccionadas'}
                </Text>
                <TouchableOpacity style={styles.emptyListButton} onPress={scanForMusic}>
                  <Text style={styles.emptyListButtonText}>Escanear Música</Text>
                </TouchableOpacity>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

      {/* Enhanced Settings Modal */}
      <Modal
        visible={showSettings}
        animationType="slide"
        presentationStyle="formSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>⚙️ Configuración</Text>
            <TouchableOpacity onPress={() => setShowSettings(false)}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.settingsContainer}>
            <Text style={styles.settingsSection}>🎵 Música</Text>
            
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
            
            <View style={styles.statsContainer}>
              <Text style={styles.statsText}>📊 Estadísticas</Text>
              <Text style={styles.statsDetailText}>
                {songs.length} canciones encontradas
              </Text>
              <Text style={styles.statsDetailText}>
                {availableFolders.length} carpetas disponibles
              </Text>
              <Text style={styles.statsDetailText}>
                {selectedFolders.length} carpetas seleccionadas
              </Text>
              <Text style={styles.statsDetailText}>
                {getFilteredSongs().length} canciones activas
              </Text>
              <Text style={styles.statsDetailText}>
                {playHistory.length} canciones en historial
              </Text>
            </View>
          </ScrollView>
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
            <Text style={styles.modalTitle}>📁 Seleccionar Carpetas</Text>
            <TouchableOpacity onPress={() => setShowFolderSelection(false)}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={availableFolders}
            keyExtractor={(item) => item.path}
            renderItem={renderFolderItem}
            style={styles.folderList}
          />
        </SafeAreaView>
      </Modal>

      {/* Lyrics Modal */}
      <Modal
        visible={showLyrics}
        animationType="slide"
        presentationStyle="formSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>🎤 Letras</Text>
            <TouchableOpacity onPress={() => setShowLyrics(false)}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.lyricsContainer}>
            <Text style={styles.lyricsTitle}>
              {currentSong?.title || 'Sin canción'}
            </Text>
            <Text style={styles.lyricsArtist}>
              {currentSong?.artist || 'Artista desconocido'}
            </Text>
            <Text style={styles.lyricsText}>
              {currentSong?.lyrics || 'Letras no disponibles para esta canción.\n\nEsta función se mejorará en futuras actualizaciones para incluir letras automáticas y sincronizadas.'}
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Loading Overlay */}
      {isScanning && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF6B35" />
            <Text style={styles.loadingText}>{scanProgress}</Text>
          </View>
        </View>
      )}
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
    backgroundColor: '#2a2a2a',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  searchInput: {
    backgroundColor: '#333',
    color: '#FFF',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    fontSize: 16,
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
    elevation: 10,
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  albumArtWrapper: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    overflow: 'hidden',
  },
  albumArt: {
    width: '100%',
    height: '100%',
  },
  albumArtPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualizerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: 50,
    marginBottom: 20,
  },
  visualizerBar: {
    width: 4,
    backgroundColor: '#FF6B35',
    marginHorizontal: 1,
    borderRadius: 2,
  },
  songInfoContainer: {
    alignItems: 'center',
    marginBottom: 20,
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
    marginBottom: 5,
  },
  currentSongAlbum: {
    fontSize: 14,
    color: '#999',
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
    borderRadius: 25,
  },
  activeControl: {
    backgroundColor: 'rgba(255, 107, 53, 0.2)',
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
    marginBottom: 20,
  },
  volumeSlider: {
    flex: 1,
    height: 40,
    marginHorizontal: 10,
  },
  quickActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  quickActionButton: {
    alignItems: 'center',
    padding: 10,
  },
  quickActionText: {
    color: '#CCC',
    fontSize: 12,
    marginTop: 5,
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
    backgroundColor: '#2a2a2a',
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 18,
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
  songInfo: {
    flex: 1,
  },
  songTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  songArtist: {
    color: '#CCC',
    fontSize: 14,
    marginBottom: 2,
  },
  songDuration: {
    color: '#999',
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
    marginBottom: 2,
  },
  folderPath: {
    color: '#999',
    fontSize: 12,
    marginBottom: 2,
  },
  folderCount: {
    color: '#CCC',
    fontSize: 14,
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
  statsContainer: {
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
  },
  statsText: {
    color: '#FF6B35',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  statsDetailText: {
    color: '#CCC',
    fontSize: 14,
    marginBottom: 5,
  },
  lyricsContainer: {
    flex: 1,
    padding: 20,
  },
  lyricsTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
  },
  lyricsArtist: {
    color: '#CCC',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
  },
  lyricsText: {
    color: '#FFF',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  emptyList: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyListText: {
    color: '#CCC',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 40,
  },
  emptyListButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyListButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    backgroundColor: '#333',
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFF',
    fontSize: 16,
    marginTop: 15,
    textAlign: 'center',
  },
});
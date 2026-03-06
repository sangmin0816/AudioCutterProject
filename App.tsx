import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  NativeModules,
  Alert,
  StatusBar,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from '@react-native-documents/picker';
import Slider from '@react-native-community/slider';
import RNFS from 'react-native-fs';

const { AudioEditor } = NativeModules;
const screenWidth = Dimensions.get('window').width;
const WAVEFORM_WIDTH = screenWidth - 80; // 일관된 너비 정의

const App = () => {
  // --- 상태 관리 ---
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 분할 관련 상태
  const [inputHour, setInputHour] = useState('0');
  const [inputMin, setInputMin] = useState('0');
  const [inputSec, setInputSec] = useState('0');
  const [splitPosition, setSplitPosition] = useState<number | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // --- 유틸리티 함수 ---
  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  const updateInputFromMs = useCallback((ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    setInputHour(h.toString());
    setInputMin(m.toString());
    setInputSec(s.toString());
  }, []);

  // --- 재생 위치 추적 (Interval) ---
  const startProgressTimer = () => {
    stopProgressTimer();
    timerRef.current = setInterval(async () => {
      try {
        const pos = await AudioEditor.getCurrentPosition();
        if (pos !== undefined) {
          setCurrentPosition(pos);
          if (pos >= duration && duration > 0) {
            onStopPlay();
          }
        }
      } catch (e) {
        console.error(e);
      }
    }, 50); // 💡 더 부드러운 이동을 위해 50ms로 조정
  };

  const stopProgressTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // --- 이벤트 핸들러 ---
  const handleSliderChange = (value: number) => {
    setCurrentPosition(value);
    updateInputFromMs(value);
  };

  const handleSliderComplete = async (value: number) => {
    await AudioEditor.seekTo(Math.floor(value));
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.pick({ type: [DocumentPicker.types.audio] });
      const file = res[0];
      setIsAnalyzing(true);
      setSplitPosition(null);

      const realPath = await AudioEditor.getRealPath(file.uri);
      const d = await AudioEditor.getAudioDuration(realPath);
      
      setFileUri(realPath);
      setDuration(d);
      setSelectedFile(file);
      setCurrentPosition(0);

      const result = await AudioEditor.getWaveformData(realPath, 80); 
      if (result) setWaveform(result);
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const onTogglePlay = async () => {
    if (!fileUri) return;
    try {
      if (isPlaying) {
        await AudioEditor.stopPlay();
        setIsPlaying(false);
        stopProgressTimer();
      } else {
        await AudioEditor.startPlay(fileUri);
        if (currentPosition > 0) {
          await AudioEditor.seekTo(Math.floor(currentPosition));
        }
        setIsPlaying(true);
        startProgressTimer();
      }
    } catch (e) {
      Alert.alert("재생 에러", "오디오를 재생할 수 없습니다.");
    }
  };

  const onStopPlay = async () => {
    await AudioEditor.stopPlay();
    setIsPlaying(false);
    stopProgressTimer();
    setCurrentPosition(0);
  };

  // 💡 입력창 수치에 따른 분할선 위치 동기화
  useEffect(() => {
    const h = parseInt(inputHour || '0', 10);
    const m = parseInt(inputMin || '0', 10);
    const s = parseInt(inputSec || '0', 10);
    const splitMs = (h * 3600 + m * 60 + s) * 1000;

    if (splitMs >= 0 && splitMs <= duration) {
      setSplitPosition(splitMs);
    }
  }, [inputHour, inputMin, inputSec, duration]);

  const handleSplit = async () => {
    if (!fileUri || splitPosition === null) return;

    setIsProcessing(true);
    if (isPlaying) await onTogglePlay();

    const path1 = `${RNFS.CachesDirectoryPath}/part_front.m4a`;
    const path2 = `${RNFS.CachesDirectoryPath}/part_back.m4a`;

    try {
      await AudioEditor.trimAudio(fileUri, path1, 0, splitPosition);
      await AudioEditor.trimAudio(fileUri, path2, splitPosition, duration);

      setIsProcessing(false);
      Alert.alert("완료", "분할된 파일을 저장하시겠습니까?", [
        { text: "취소" },
        { text: "저장", onPress: () => saveFiles([path1, path2]) }
      ]);
    } catch (e) {
      setIsProcessing(false);
      Alert.alert("에러", "분할 중 오류가 발생했습니다.");
    }
  };

  const saveFiles = async (paths: string[]) => {
    try {
      const directory = await DocumentPicker.pickDirectory();
      if (!directory || !directory.uri) return;

      for (let i = 0; i < paths.length; i++) {
        const fileName = `split_${Date.now()}_${i === 0 ? 'front' : 'back'}.m4a`;
        await AudioEditor.saveToTreeUri(directory.uri, paths[i], fileName);
      }
      Alert.alert("성공", "파일 저장이 완료되었습니다! 🌸");
    } catch (e) {
      console.error(e);
    }
  };

  const splitX = (splitPosition !== null && duration > 0) ? (splitPosition / duration) * WAVEFORM_WIDTH : 0;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>🎧 상냥한 통합 오디오 커터</Text>
        
        <TouchableOpacity style={styles.pickButton} onPress={pickFile}>
          <Text style={styles.buttonText}>파일 선택하기</Text>
        </TouchableOpacity>

        {fileUri && (
          <View style={styles.playerCard}>
            <Text style={styles.fileName}>{selectedFile?.name}</Text>
            <Text style={styles.timer}>
              {formatTime(currentPosition)} / {formatTime(duration)}
            </Text>

            {/* 비주얼라이저 영역 */}
            <View style={styles.visualizerContainer}>
              <View style={styles.waveformWrapper}>
                {isAnalyzing ? (
                  <ActivityIndicator color="#6200EE" />
                ) : waveform.length > 0 ? (
                  waveform.map((val, index) => (
                    <View
                      key={index}
                      style={[
                        styles.waveBar,
                        {
                          height: Math.max(5, val * 100), 
                          backgroundColor: (index / waveform.length) * duration < currentPosition 
                            ? '#FF4081' : '#E0E0E0'
                        }
                      ]}
                    />
                  ))
                ) : (
                  <Text style={styles.statusText}>파형을 표시할 수 없습니다.</Text>
                )}
              </View>

              {/* 💡 분할선 (노란색 점선) */}
              {splitPosition !== null && splitPosition > 0 && (
                <View style={[styles.splitLine, { left: splitX }]} />
              )}

              {/* 💡 투명 슬라이더 (조작 레이어) */}
              {!isAnalyzing && waveform.length > 0 && (
                <Slider
                  style={styles.overlaidSlider}
                  minimumValue={0}
                  maximumValue={duration}
                  value={currentPosition}
                  onValueChange={handleSliderChange}
                  onSlidingComplete={handleSliderComplete}
                  thumbTintColor="transparent"
                  minimumTrackTintColor="transparent"
                  maximumTrackTintColor="transparent"
                  tapToSeek={true}
                />
              )}
            </View>

            <View style={styles.playerControls}>
              <TouchableOpacity style={styles.iconBtn} onPress={onTogglePlay}>
                <Text style={styles.iconText}>{isPlaying ? "⏸ 일시정지" : "▶ 재생 시작"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stopBtn} onPress={onStopPlay}>
                <Text style={styles.stopText}>⏹ 정지</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.inputArea}>
          <Text style={styles.label}>정밀 분할 지점 설정</Text>
          <View style={styles.row}>
            <TextInput style={styles.input} value={inputHour} onChangeText={setInputHour} keyboardType="numeric" />
            <Text style={styles.unit}>시</Text>
            <TextInput style={styles.input} value={inputMin} onChangeText={setInputMin} keyboardType="numeric" />
            <Text style={styles.unit}>분</Text>
            <TextInput style={styles.input} value={inputSec} onChangeText={setInputSec} keyboardType="numeric" />
            <Text style={styles.unit}>초</Text>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.splitButton, (!fileUri || isProcessing) && styles.disabledBtn]} 
          onPress={handleSplit}
          disabled={!fileUri || isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.splitButtonText}>분할 실행 및 저장</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  scrollContent: { padding: 20, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', marginVertical: 20, color: '#333' },
  pickButton: { backgroundColor: '#6200EE', padding: 15, borderRadius: 10, width: '100%', marginBottom: 20 },
  buttonText: { color: '#FFF', textAlign: 'center', fontWeight: 'bold' },
  playerCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 20, width: '100%', elevation: 8, alignItems: 'center' },
  fileName: { fontSize: 14, color: '#636e72', marginBottom: 10 },
  timer: { fontSize: 26, fontWeight: 'bold', color: '#2d3436', marginBottom: 20 },
  visualizerContainer: { width: WAVEFORM_WIDTH, height: 120, position: 'relative', justifyContent: 'center', backgroundColor: '#F9F9F9', borderRadius: 15, overflow: 'hidden' },
  waveformWrapper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' },
  waveBar: { width: WAVEFORM_WIDTH / 80 - 1, marginHorizontal: 0.5, borderRadius: 2 },
  statusText: { color: '#999', fontSize: 12 },
  customPlayhead: { position: 'absolute', width: 2, height: '100%', backgroundColor: '#FF4081', zIndex: 20 },
  splitLine: { position: 'absolute', width: 2, height: '100%', backgroundColor: '#FFD700', zIndex: 15, borderStyle: 'dashed', borderWidth: 1, borderColor: '#FFD700' },
  overlaidSlider: { position: 'absolute', width: WAVEFORM_WIDTH, height: 120, zIndex: 30 },
  playerControls: { flexDirection: 'row', marginTop: 20, width: '100%', justifyContent: 'center' },
  iconBtn: { padding: 15, backgroundColor: '#E1E2FF', borderRadius: 10, marginHorizontal: 10 },
  iconText: { color: '#6200EE', fontWeight: 'bold' },
  stopBtn: { padding: 15, backgroundColor: '#FFE1E1', borderRadius: 10, marginHorizontal: 10 },
  stopText: { color: '#FF4081', fontWeight: 'bold' },
  inputArea: { marginVertical: 30, width: '100%', alignItems: 'center' },
  label: { fontWeight: 'bold', marginBottom: 15, color: '#2d3436' },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: { backgroundColor: '#FFF', borderBottomWidth: 2, borderBottomColor: '#6200EE', width: 50, textAlign: 'center', fontSize: 20, marginHorizontal: 5, color: '#333' },
  unit: { fontSize: 16, color: '#636e72', marginRight: 10 },
  splitButton: { backgroundColor: '#00B894', padding: 18, borderRadius: 12, width: '100%', marginTop: 10 },
  splitButtonText: { color: '#FFF', textAlign: 'center', fontSize: 18, fontWeight: 'bold' },
  disabledBtn: { backgroundColor: '#B2BEC3' }
});

export default App;
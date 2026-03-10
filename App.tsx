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
import { FileLogger } from "react-native-file-logger";

const { AudioEditor } = NativeModules;
const screenWidth = Dimensions.get('window').width;
const WAVEFORM_WIDTH = screenWidth - 80;

const App = () => {
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
  const [splitPosition, setSplitPosition] = useState<number>(0);
  const [fileTimestamp, setFileTimestamp] = useState<number>(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // 💡 초기 설정을 마쳤는지 확인하는 ref (드래그 방해 금지용)
  const isInitialSet = useRef(false);

  // --- 유틸리티 함수 ---
  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  // ms 데이터를 '시, 분, 초' 입력창 텍스트로 변환
  const updateInputFromMs = useCallback((ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    setInputHour(h.toString());
    setInputMin(m.toString());
    setInputSec(s.toString());
  }, []);

  // --- 재생 타이머 로직 ---
  const startProgressTimer = () => {
    stopProgressTimer();
    timerRef.current = setInterval(async () => {
      try {
        const pos = await AudioEditor.getCurrentPosition();
        if (pos !== undefined) {
          setCurrentPosition(pos);
          if (pos >= duration && duration > 0) onStopPlay();
        }
      } catch (e) { console.error(e); }
    }, 50);
  };

  const stopProgressTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // 💡 1. 파일 로드 시 초기 중앙 배치 로직
  useEffect(() => {
    if (duration > 0 && !isInitialSet.current) {
      const middle = duration / 2;
      setSplitPosition(middle);
      updateInputFromMs(middle);
      isInitialSet.current = true; // 설정 완료 🌸
    }
  }, [duration, fileUri, updateInputFromMs, fileTimestamp]);

  // 💡 2. 수직 분할선 드래그 시 함수
  const handleSplitChange = (value: number) => {
    setSplitPosition(value);
    updateInputFromMs(value); // 시간 입력창 즉시 업데이트
  };

  const handleSplitComplete = async (value: number) => {
    try {
      await AudioEditor.seekTo(Math.floor(value));
      setCurrentPosition(value);
    } catch (e) { console.error(e); }
  };

  // 💡 3. 시간 직접 입력 시 선 위치 업데이트 (분할 실행 시 호출되거나 필요한 시점에 수동 호출)
  const handleTimeInputSync = () => {
    const h = parseInt(inputHour || '0', 10);
    const m = parseInt(inputMin || '0', 10);
    const s = parseInt(inputSec || '0', 10);
    const splitMs = (h * 3600 + m * 60 + s) * 1000;

    if (splitMs >= 0 && splitMs <= duration) {
      setSplitPosition(splitMs);
    } else {
      Alert.alert("알림", "파일 길이를 초과하는 시간입니다. 🌸");
    }
  };

  // 수평 재생바 드래그
  const handleProgressChange = (value: number) => {
    setCurrentPosition(value);
  };

  const handleProgressComplete = async (value: number) => {
    try {
      await AudioEditor.seekTo(Math.floor(value));
    } catch (e) { console.error(e); }
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.pick({ type: [DocumentPicker.types.audio] });
      const file = res[0];
      setIsAnalyzing(true);
      isInitialSet.current = false; // 새 파일이므로 초기화 플래그 리셋 🌸

      const realPath = await AudioEditor.getRealPath(file.uri);
      const d = await AudioEditor.getAudioDuration(realPath);
      
      setFileTimestamp(Date.now());
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
        await AudioEditor.seekTo(Math.floor(currentPosition));
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

  const handleSplit = async () => {
    // 💡 실행 전 입력창 숫자를 최종적으로 선 위치에 동기화
    handleTimeInputSync();
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
    } catch (e) { console.error(e); }
  };

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

              {/* 📍 1. 시각적인 노란색 분할선 */}
              <View style={[styles.splitLine, { left: (splitPosition / duration) * WAVEFORM_WIDTH }]} />
              
              {/* 📍 2. 수직 분할선 조작용 투명 슬라이더 */}
              <Slider
                style={styles.splitSliderOverlay}
                minimumValue={0}
                maximumValue={duration}
                value={splitPosition}
                onValueChange={handleSplitChange}
                onSlidingComplete={handleSplitComplete}
                thumbTintColor="transparent"
                minimumTrackTintColor="transparent"
                maximumTrackTintColor="transparent"
              />
            </View>

            {/* 📍 3. 하단 분홍색 수평 재생바 */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBarWrapper}>
                <View style={styles.progressBackground}>
                  <View style={[styles.progressFill, { width: `${(currentPosition / duration) * 100}%` }]} />
                </View>
              </View>
              <Slider
                style={styles.horizontalSlider}
                minimumValue={0}
                maximumValue={duration}
                value={currentPosition}
                onValueChange={handleProgressChange}
                onSlidingComplete={handleProgressComplete}
                thumbTintColor="#FF4081"
                minimumTrackTintColor="transparent"
                maximumTrackTintColor="transparent"
              />
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
          <Text style={styles.label}>정밀 분할 지점 설정 (직접 입력 후 선 이동)</Text>
          <View style={styles.row}>
            <TextInput style={styles.input} value={inputHour} onChangeText={setInputHour} onBlur={handleTimeInputSync} keyboardType="numeric" />
            <Text style={styles.unit}>시</Text>
            <TextInput style={styles.input} value={inputMin} onChangeText={setInputMin} onBlur={handleTimeInputSync} keyboardType="numeric" />
            <Text style={styles.unit}>분</Text>
            <TextInput style={styles.input} value={inputSec} onChangeText={setInputSec} onBlur={handleTimeInputSync} keyboardType="numeric" />
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
  // --- 1. 전체 레이아웃 (Layout) ---
  container: { 
    flex: 1, 
    backgroundColor: '#F5F7FA' 
  },
  scrollContent: { 
    padding: 20, 
    alignItems: 'center' 
  },
  title: { 
    fontSize: 22, 
    fontWeight: 'bold', 
    marginVertical: 20, 
    color: '#333' 
  },

  // --- 2. 파일 선택 버튼 (File Picker) ---
  pickButton: { 
    backgroundColor: '#6200EE', 
    padding: 15, 
    borderRadius: 12, 
    width: '100%', 
    marginBottom: 20,
    elevation: 3, // 안드로이드 그림자
  },
  buttonText: { 
    color: '#FFF', 
    textAlign: 'center', 
    fontWeight: 'bold' 
  },

  // --- 3. 메인 플레이어 카드 (Player Card) ---
  playerCard: { 
    backgroundColor: '#FFF', 
    padding: 20, 
    borderRadius: 24, 
    width: '100%', 
    elevation: 8, 
    alignItems: 'center',
    shadowColor: '#000', // iOS 그림자
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  fileName: { 
    fontSize: 14, 
    color: '#636e72', 
    marginBottom: 8 
  },
  timer: { 
    fontSize: 28, 
    fontWeight: 'bold', 
    color: '#2d3436', 
    marginBottom: 20 
  },

  // --- 4. 파형 및 수직 분할선 영역 (Waveform & Split Line) ---
  visualizerContainer: { 
    width: WAVEFORM_WIDTH, 
    height: 120, 
    position: 'relative', 
    justifyContent: 'center', 
    backgroundColor: '#F9F9F9', 
    borderRadius: 16,
    overflow: 'hidden' // 선이 튀어나가지 않게 상냥하게 잡아줍니다.
  },
  waveformWrapper: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    width: '100%', 
    height: '100%' 
  },
  waveBar: { 
    width: WAVEFORM_WIDTH / 80 - 1, 
    marginHorizontal: 0.5, 
    borderRadius: 2 
  },
  statusText: { 
    color: '#999', 
    fontSize: 12 
  },
  
  // 📍 수직 분할선 (실제로 보이는 노란 선)
  splitLine: { 
    position: 'absolute', 
    width: 3, 
    height: '100%', 
    backgroundColor: '#FFEB3B', 
    zIndex: 50 
  },
  // 📍 수직 분할선 조작 레이어 (투명 슬라이더)
  splitSliderOverlay: { 
    position: 'absolute', 
    width: WAVEFORM_WIDTH, 
    height: 120, 
    top: 0, 
    zIndex: 100 
  },

  // --- 5. 하단 수평 재생바 (Horizontal Progress Bar) ---
  progressContainer: { 
    width: WAVEFORM_WIDTH, 
    height: 40, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginTop: 24, 
    position: 'relative' 
  },
  progressBarWrapper: { 
    position: 'absolute', 
    width: '100%', 
    height: 8, 
    justifyContent: 'center' 
  },
  progressBackground: { 
    width: '100%', 
    height: 8, 
    backgroundColor: '#E0E0E0', 
    borderRadius: 4, 
    overflow: 'hidden' 
  },
  progressFill: { 
    height: '100%', 
    backgroundColor: '#FF4081' 
  },
  horizontalSlider: { 
    width: WAVEFORM_WIDTH + 16, 
    height: 40, 
    zIndex: 10 
  },

  // --- 6. 재생 컨트롤 버튼 (Controls) ---
  playerControls: { 
    flexDirection: 'row', 
    marginTop: 20, 
    width: '100%', 
    justifyContent: 'center' 
  },
  iconBtn: { 
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#E1E2FF', 
    borderRadius: 12, 
    marginHorizontal: 8 
  },
  iconText: { 
    color: '#6200EE', 
    fontWeight: 'bold' 
  },
  stopBtn: { 
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#FFE1E1', 
    borderRadius: 12, 
    marginHorizontal: 8 
  },
  stopText: { 
    color: '#FF4081', 
    fontWeight: 'bold' 
  },

  // --- 7. 정밀 입력 영역 (Time Input) ---
  inputArea: { 
    marginVertical: 32, 
    width: '100%', 
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 20,
  },
  label: { 
    fontWeight: 'bold', 
    marginBottom: 16, 
    color: '#2d3436',
    fontSize: 15,
  },
  row: { 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  input: { 
    backgroundColor: '#F1F3F5', 
    borderRadius: 8,
    width: 55, 
    height: 45,
    textAlign: 'center', 
    fontSize: 20, 
    marginHorizontal: 4, 
    color: '#333',
    fontWeight: '600',
  },
  unit: { 
    fontSize: 14, 
    color: '#636e72', 
    marginRight: 8 
  },

  // --- 8. 최종 실행 버튼 (Action Button) ---
  splitButton: { 
    backgroundColor: '#00C853', 
    padding: 18, 
    borderRadius: 14, 
    width: '100%', 
    marginTop: 10,
    elevation: 4,
  },
  splitButtonText: { 
    color: '#FFF', 
    textAlign: 'center', 
    fontWeight: 'bold', 
    fontSize: 18 
  },
  disabledBtn: { 
    backgroundColor: '#B2BEC3' 
  },
  // --- Styles 추가 ---
errorTestButton: {
  backgroundColor: '#FF7675', // 부드러운 빨간색
  padding: 15,
  borderRadius: 12,
  width: '100%',
  marginBottom: 20,
},
});

export default App;
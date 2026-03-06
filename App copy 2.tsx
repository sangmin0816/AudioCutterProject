import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  NativeModules,
  Alert,
  StatusBar, // 상태바 제어를 위해 추가
} from 'react-native';
import * as DocumentPicker from '@react-native-documents/picker';
import AudioAnalyzer from 'react-native-audio-analyzer';
import Slider from '@react-native-community/slider';

const { AudioEditor } = NativeModules;
const screenWidth = Dimensions.get('window').width;

const App = () => {
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const formatTime = (millis: number) => {
    const totalSeconds = millis / 1000;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  const startProgressTimer = () => {
    stopProgressTimer();
    timerRef.current = setInterval(async () => {
      try {
        const pos = await AudioEditor.getCurrentPosition();
        setCurrentPosition(pos);
        if (pos >= duration && duration > 0) {
          onStopPlay();
        }
      } catch (e) {
        console.error(e);
      }
    }, 100);
  };

  const stopProgressTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.pick({ type: [DocumentPicker.types.audio] });
      const uri = res[0].uri;
      setFileUri(uri);
      const d = await AudioEditor.getAudioDuration(uri);
      setDuration(d);
      AudioAnalyzer.getWaveform(uri, { points: 80 }, (err, values) => {
        if (!err) setWaveform(values);
      });
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) console.error(err);
    }
  };

  const onStartPlay = async () => {
    if (!fileUri) return;
    try {
      await AudioEditor.startPlay(fileUri);
      setIsPlaying(true);
      startProgressTimer();
    } catch (e) {
      Alert.alert("재생 에러", "파일을 재생할 수 없습니다.");
    }
  };

  const onStopPlay = async () => {
    await AudioEditor.stopPlay();
    setIsPlaying(false);
    stopProgressTimer();
    setCurrentPosition(0);
  };

  const onSeek = async (value: number) => {
    await AudioEditor.seekTo(Math.floor(value));
    setCurrentPosition(value);
  };

  const playheadPosition = duration > 0 ? (currentPosition / duration) * (screenWidth - 40) : 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* 💡 상태바를 밝게 설정하여 배경과 대비를 줍니다 */}
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      <View style={styles.header}>
        <Text style={styles.title}>🎵 상냥한 네이티브 커터</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={pickFile}>
        <Text style={styles.buttonText}>오디오 파일 선택</Text>
      </TouchableOpacity>

      {fileUri ? (
        <View style={styles.playerContainer}>
          <Text style={styles.totalTimeText}>전체 길이: {formatTime(duration)}</Text>

          <View style={styles.waveformWrapper}>
            {waveform.length > 0 ? (
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
              <Text style={{color: '#999'}}>파형을 분석 중입니다...</Text>
            )}
            
            <View style={[styles.playheadContainer, { left: playheadPosition }]}>
              <View style={styles.timeTooltip}>
                <Text style={styles.timeTooltipText}>{formatTime(currentPosition)}</Text>
              </View>
              <View style={styles.playheadLine} />
            </View>
          </View>

          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={duration}
            value={currentPosition}
            onValueChange={(val) => setCurrentPosition(val)}
            onSlidingComplete={onSeek}
            minimumTrackTintColor="transparent"
            maximumTrackTintColor="transparent"
            thumbTintColor="#FF4081"
          />

          <View style={styles.controls}>
            <TouchableOpacity 
              style={styles.controlBtnWrapper} 
              onPress={isPlaying ? onStopPlay : onStartPlay}
            >
              <Text style={styles.controlBtnText}>
                {isPlaying ? "⏹️ 정지" : "▶️ 재생 시작"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>편집할 파일을 선택해 주세요.</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#FFFFFF', // 💡 배경을 확실한 흰색으로 설정
  },
  header: {
    marginTop: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  title: { 
    fontSize: 22, 
    fontWeight: 'bold', 
    color: '#333333', // 💡 글자색을 어두운 색으로 명시
  },
  button: { 
    backgroundColor: '#6200EE', 
    padding: 15, 
    borderRadius: 8, 
    marginHorizontal: 20,
  },
  buttonText: { 
    color: '#FFFFFF', 
    textAlign: 'center', 
    fontWeight: 'bold',
    fontSize: 16,
  },
  playerContainer: { 
    marginTop: 60, 
    width: '100%', 
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#999',
    fontSize: 16,
  },
  totalTimeText: { 
    marginBottom: 30, 
    color: '#666666', 
    fontSize: 14,
    fontWeight: '600',
  },
  waveformWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: screenWidth - 40,
    height: 120,
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    overflow: 'visible',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  waveBar: { 
    width: (screenWidth - 60) / 80, 
    marginHorizontal: 0.5, 
    borderRadius: 2,
  },
  playheadContainer: { 
    position: 'absolute', 
    alignItems: 'center', 
    height: '100%', 
    zIndex: 10,
  },
  playheadLine: { 
    width: 2, 
    height: '100%', 
    backgroundColor: '#FF4081',
  },
  timeTooltip: {
    position: 'absolute',
    top: -35,
    backgroundColor: '#FF4081',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    elevation: 3, // 안드로이드 그림자
  },
  timeTooltipText: { 
    color: '#FFFFFF', 
    fontSize: 12, 
    fontWeight: 'bold',
  },
  slider: { 
    width: screenWidth - 20, 
    height: 50, 
    marginTop: -35, // 파형과 겹치도록 조정
    zIndex: 20,
  },
  controls: { 
    marginTop: 50, 
    width: '100%',
    alignItems: 'center',
  },
  controlBtnWrapper: {
    backgroundColor: '#EEEEEE',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
  },
  controlBtnText: { 
    fontSize: 18, 
    color: '#6200EE', 
    fontWeight: 'bold',
  },
});

export default App;
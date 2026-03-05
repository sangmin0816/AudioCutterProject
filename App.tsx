import React, { useState, useRef } from 'react';
import {
  View, Button, Text, TextInput, Alert, StyleSheet, SafeAreaView, NativeModules, ScrollView
} from 'react-native';
import * as DocumentPicker from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import Video from 'react-native-video'; // 오디오 재생용

const { AudioEditor } = NativeModules;

export default function App() {
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [fileDurationMs, setFileDurationMs] = useState(0);
  const [currentTimeMs, setCurrentTimeMs] = useState(0); // 현재 재생 위치
  const [paused, setPaused] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [inputHour, setInputHour] = useState('0');
  const [inputMin, setInputMin] = useState('0');
  const [inputSec, setInputSec] = useState('0');

  const playerRef = useRef<Video>(null);

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.pick({ type: [DocumentPicker.types.audio] });
      const file = res[0];
      // const inputPath = decodeURIComponent(file.uri).replace('file://', '');
      const duration = await AudioEditor.getAudioDuration(file.uri);
      // const duration = 36000;
      setSelectedFile(file);
      setFileDurationMs(duration);
      
      setPaused(true);
      setCurrentTimeMs(0);
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) console.error(err);
    }
  };

  // 💡 재생 중인 현재 시간을 입력창에 자동으로 채워주는 상냥한 기능
  const setCurrentTimeToInput = () => {
    const totalSec = Math.floor(currentTimeMs / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    
    setInputHour(h.toString());
    setInputMin(m.toString());
    setInputSec(s.toString());
  };

  const handleSplit = async () => {
    if (!selectedFile) return;

    const h = parseInt(inputHour || '0');
    const m = parseInt(inputMin || '0');
    const s = parseInt(inputSec || '0');
    const splitPointMs = (h * 3600 + m * 60 + s) * 1000;

    if (splitPointMs <= 0 || splitPointMs >= fileDurationMs) {
      Alert.alert("범위 오류", "올바른 분할 지점을 입력해주세요.");
      return;
    }

    setIsProcessing(true);
    setPaused(true); // 작업 중에는 재생 중단

    const path1 = `${RNFS.CachesDirectoryPath}/part_front.mp4`;
    const path2 = `${RNFS.CachesDirectoryPath}/part_back.mp4`;

    try {
      const inputPath = selectedFile.uri;
      console.log(inputPath);
      await AudioEditor.trimAudio(inputPath, path1, 0, splitPointMs);
      await AudioEditor.trimAudio(inputPath, path2, splitPointMs, fileDurationMs);

      setIsProcessing(false);
      Alert.alert("완료", "분할된 파일을 저장하시겠습니까?", [
        { text: "취소" },
        { text: "저장", onPress: () => saveFiles([path1, path2]) }
      ]);
    } catch (e) {
      setIsProcessing(false);
      console.log(e)
      Alert.alert("에러", "분할 중 오류가 발생했습니다.");
    }
  };

  const formatMsToTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h}:${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
  };

  const saveFiles = async (paths: string[]) => {
    const directory = await DocumentPicker.pickDirectory();
    if (!directory || !directory.uri) return;

    for (let i = 0; i < paths.length; i++) {
      const fileName = `split_${Date.now()}_${i}.m4a`;
      
      // 네이티브 모듈의 새로운 함수 호출!
      await AudioEditor.saveToTreeUri(
        directory.uri, // Step #1의 Tree Uri
        paths[i],      // 원본 임시 파일 경로
        fileName       // 생성할 파일 이름
      );
    }
    Alert.alert("성공", "정석적인 방법으로 저장이 완료되었습니다! 🌸");
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.center}>
        <Text style={styles.title}>🎧 플레이어 겸 분할기</Text>
        <Button title="오디오 파일 선택" onPress={pickFile} color="#6C5CE7" />

        {selectedFile && (
          <View style={styles.playerCard}>
            {/* 오디오 재생 엔진 (화면에는 보이지 않음) */}
            <Video
              source={{ uri: selectedFile.uri }}
              ref={playerRef}
              paused={paused}
              onProgress={(data) => setCurrentTimeMs(data.currentTime * 1000)}
              onEnd={() => setPaused(true)}
              style={{ width: 0, height: 0 }} // 숨김 처리
            />

            <Text style={styles.fileName}>{selectedFile.name}</Text>
            <Text style={styles.timer}>
              {formatMsToTime(currentTimeMs)} / {formatMsToTime(fileDurationMs)}
            </Text>

            <View style={styles.playerControls}>
              <Button title={paused ? "▶ 재생" : "⏸ 일시정지"} onPress={() => setPaused(!paused)} color="#0984e3" />
              <View style={{ width: 10 }} />
              <Button title="📍 이 지점을 분할점으로" onPress={setCurrentTimeToInput} color="#e17055" />
            </View>
          </View>
        )}

        <View style={styles.inputArea}>
          <Text style={styles.label}>분할 지점 (시:분:초)</Text>
          <View style={styles.row}>
            <TextInput style={styles.input} value={inputHour} onChangeText={setInputHour} keyboardType="numeric" />
            <Text>시</Text>
            <TextInput style={styles.input} value={inputMin} onChangeText={setInputMin} keyboardType="numeric" />
            <Text>분</Text>
            <TextInput style={styles.input} value={inputSec} onChangeText={setInputSec} keyboardType="numeric" />
            <Text>초</Text>
          </View>
        </View>

        <Button 
          title={isProcessing ? "처리 중..." : "분할 실행 및 저장"} 
          onPress={handleSplit} 
          disabled={!selectedFile || isProcessing} 
          color="#00B894" 
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { padding: 20, alignItems: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', marginVertical: 20 },
  playerCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 15, width: '100%', elevation: 5, alignItems: 'center' },
  fileName: { fontSize: 14, color: '#636e72', marginBottom: 10 },
  timer: { fontSize: 24, fontWeight: 'bold', color: '#2d3436', marginBottom: 20 },
  playerControls: { flexDirection: 'row' },
  inputArea: { marginVertical: 30, width: '100%', alignItems: 'center' },
  label: { fontWeight: 'bold', marginBottom: 15 },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: { backgroundColor: '#FFF', borderBottomWidth: 2, borderBottomColor: '#6C5CE7', width: 45, textAlign: 'center', fontSize: 18, marginHorizontal: 5 }
});
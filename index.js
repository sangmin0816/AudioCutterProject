import { AppRegistry } from 'react-native';
import App from './App'; // 실제 앱의 메인 컴포넌트
import { name as appName } from './app.json';

import { Alert } from 'react-native';
import { setJSExceptionHandler } from 'react-native-exception-handler';
import Mailer from 'react-native-mail';
import { FileLogger } from "react-native-file-logger";

FileLogger.configure({
  captureConsole: true, // 콘솔 로그를 파일로 저장
  dailyRolling: true,
});

// 전역 오류 핸들러 설정
setJSExceptionHandler((error, isFatal) => {
  if (isFatal) {
    // 💡 사용자에게 상냥하게 상황을 설명하는 알림창을 띄웁니다.
    Alert.alert(
      "아차! 오류가 발생했어요 🌸",
      "앱에 예기치 못한 문제가 생겨서 잠시 멈췄어요. 개발자에게 로그를 보내주시면 빠르게 고쳐드릴게요. 도와주시겠어요?",
      [
        {
          text: "아니요, 괜찮아요",
          onPress: () => {
            // 앱을 종료하거나 다른 처리를 할 수 있습니다.
          },
          style: "cancel"
        },
        { 
          text: "네, 보낼게요! ✨", 
          onPress: () => sendErrorLogToDeveloper(error) 
        }
      ]
    );
  }
}, true);

// 📧 로그 전송 함수 (최종 방어 버전)
const sendErrorLogToDeveloper = async (error) => {
  try {
    // 1. 에러 객체 자체에 대한 방어
    const safeError = error || { message: '알 수 없는 오류', stack: '정보 없음' };
    const errorMessage = safeError.message || '메시지 없음';
    const errorStack = safeError.stack || '스택 정보 없음';

    // 2. 로그 경로 확인 (비동기 처리 시 null 방지)
    let logPaths = [];
    try {
      const paths = await FileLogger.getLogFilePaths();
      logPaths = paths || [];
    } catch (logErr) {
      console.log("로그 경로를 가져오는 데 실패했어요. 🌸");
    }

    // 3. Mailer 호출 시 모든 인자를 문자열로 확실히 변환
    Mailer.mail({
      subject: String('🎧 오디오 커터 앱 오류 보고'),
      recipients: [String('choijinsa99@gmail.com')],
      body: String(`오류 메시지: ${errorMessage}\n\n스택 트레이스: ${errorStack}`),
      // 💡 일단 문제를 확실히 잡기 위해 attachments를 완전히 제외하고 테스트해 보세요!
    }, (event) => {
      // 💡 콜백 함수 내부에서도 발생할 수 있는 오류 방지
      if (!event) return;
      
      if (event === 'sent') {
        Alert.alert("감사합니다! 🌸", "전달해주신 정보를 바탕으로 상냥하게 고쳐볼게요.");
      } else if (event === 'error') {
        Alert.alert("알림", "메일 앱 실행 중 문제가 발생했습니다.");
      }
    });

  } catch (e) {
    // 💡 여기서 에러가 잡힌다면 이 구문 자체가 문제일 확률이 높습니다.
    console.error("최종 단계 로그 전송 실패:", e);
    Alert.alert("오류", "로그 전송 준비 중 문제가 발생했습니다.");
  }
};

AppRegistry.registerComponent(appName, () => App);
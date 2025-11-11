// Firebase SDK 함수 가져오기
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-storage.js";

// Firebase 앱 설정
const firebaseConfig = {
    apiKey: "AIzaSyB5TAYEoAEawpaYr1tR373OhCYumOc4B7o",
    authDomain: "chat-33290.firebaseapp.com",
    databaseURL: "https://chat-33290-default-rtdb.firebaseio.com",
    projectId: "chat-33290",
    storageBucket: "chat-33290.firebasestorage.app",
    messagingSenderId: "894357766876",
    appId: "1:894357766876:web:bd27cd3f1da7e29b3eaa19"
};

// Firebase 앱 초기화
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const storage = getStorage(app);

// 다른 모듈에서 사용할 수 있도록 내보내기
export { app, database, storage };

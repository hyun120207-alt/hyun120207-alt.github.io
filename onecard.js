// Firebase SDK 가져오기 (채팅 앱과 동일한 버전 사용)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getDatabase, ref, push, onValue, set, remove, onDisconnect, runTransaction } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-database.js";

// Firebase 설정 (채팅 앱과 동일한 설정 사용)
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
const app = initializeApp(firebaseConfig, "onecard-game"); // 이름 충돌 방지를 위해 앱 이름 지정
const database = getDatabase(app);

// DOM 요소
const gameLobby = document.getElementById('game-lobby');
const roomList = document.getElementById('room-list');
const createRoomBtn = document.getElementById('create-room-btn');
const roomNameInput = document.getElementById('room-name-input');
// ⛔️ [AI] AI 관련 DOM 요소 추가
const aiCheckbox = document.getElementById('ai-checkbox');
const geminiApiKeyInput = document.getElementById('gemini-api-key-input');

const gameRoom = document.getElementById('game-room');
const roomTitle = document.getElementById('room-title');
const startGameBtn = document.getElementById('start-game-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const opponentHand = document.getElementById('opponent-hand');
const myHand = document.getElementById('my-hand');
const discardPile = document.getElementById('discard-pile');


// Firebase 참조
const roomsRef = ref(database, 'onecard_rooms');
let currentPlayer = {
    id: `player_${Date.now()}`, // 고유 ID 미리 생성
    name: null,
    roomId: null,
    playerRef: null
};
let currentRoomRef = null;

// ⛔️ [AI] AI 관련 전역 변수
let localGeminiKey = null; // 방장의 브라우저 메모리에만 API 키 저장
let isAiThinking = false;  // AI가 API 호출 중일 때 중복 실행 방지 락(Lock)
const AI_PLAYER_ID = "player_AI_Gemini"; // AI 플레이어 고유 ID

// ⛔️ [AI] AI 옵션 UI 토글
aiCheckbox.addEventListener('change', () => {
    geminiApiKeyInput.style.display = aiCheckbox.checked ? 'block' : 'none';
});


// --- 로비 로직 ---

// 방 만들기
createRoomBtn.addEventListener('click', () => {
    const roomName = roomNameInput.value.trim();
    if (!roomName) {
        alert('방 제목을 입력하세요.');
        return;
    }
    
    // ⛔️ [AI] AI 옵션 확인
    const isWithAI = aiCheckbox.checked;
    if (isWithAI) {
        localGeminiKey = geminiApiKeyInput.value.trim();
        if (!localGeminiKey) {
            alert('AI 플레이어를 포함하려면 Gemini API 키를 입력해야 합니다.');
            return;
        }
    }
    
    // ⛔️ [AI] 방 생성 시 AI 플레이어 추가 로직
    if (!currentPlayer.name) {
        const playerName = prompt('게임에서 사용할 이름을 입력하세요:');
        if (!playerName) return;
        currentPlayer.name = playerName;
    }

    const newRoomRef = push(roomsRef);
    const roomId = newRoomRef.key;

    // 1. 방 기본 정보 설정
    set(newRoomRef, {
        name: roomName,
        players: {}, // 플레이어는 enterRoom에서 각자 추가
        state: 'waiting',
        host: currentPlayer.id
    }).then(() => {
        // 2. [AI] 방장이 AI 플레이어를 DB에 추가
        if (isWithAI) {
            const aiPlayerRef = ref(database, `onecard_rooms/${roomId}/players/${AI_PLAYER_ID}`);
            set(aiPlayerRef, { 
                name: "Gemini AI", 
                isAI: true, 
                hand: {} 
            });
        }
        
        // 3. 방장 입장
        enterRoom(roomId, roomName);
    });
    
    roomNameInput.value = '';
    aiCheckbox.checked = false;
    geminiApiKeyInput.style.display = 'none';
    geminiApiKeyInput.value = '';
});


// 방 목록 실시간 업데이트 (기존과 동일)
onValue(roomsRef, (snapshot) => {
    roomList.innerHTML = '';
    if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
            const roomId = childSnapshot.key;
            const roomData = childSnapshot.val();
            const playerCount = roomData.players ? Object.keys(roomData.players).length : 0;
            
            // ⛔️ [AI] 최대 인원 6명으로 유지 (AI 포함)
            if (playerCount < 6 && roomData.state === 'waiting') {
                const roomItem = document.createElement('div');
                roomItem.className = 'room-item';
                roomItem.innerHTML = `
                    <span>${roomData.name}</span>
                    <span>(${playerCount}/6)</span>
                `;
                roomItem.addEventListener('click', () => enterRoom(roomId, roomData.name));
                roomList.appendChild(roomItem);
            }
        });
    }
    if (!roomList.hasChildNodes()) {
        roomList.innerHTML = '<p>참여 가능한 방이 없습니다. 새 방을 만들어보세요!</p>';
    }
});


// --- 게임 방 로직 ---

function enterRoom(roomId, name) {
    if (!currentPlayer.name) {
        const playerName = prompt('게임에서 사용할 이름을 입력하세요:');
        if (!playerName) return;
        currentPlayer.name = playerName;
    }

    currentPlayer.roomId = roomId;
    currentRoomRef = ref(database, `onecard_rooms/${roomId}`);
    currentPlayer.playerRef = ref(database, `onecard_rooms/${roomId}/players/${currentPlayer.id}`);
    
    set(currentPlayer.playerRef, { name: currentPlayer.name, hand: {} });
    onDisconnect(currentPlayer.playerRef).remove();

    roomTitle.textContent = name;
    
    gameLobby.style.display = 'none';
    gameRoom.style.display = 'flex';

    // 방 정보 감시 (플레이어, 게임 상태 등)
    onValue(currentRoomRef, (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData) { // 방이 사라진 경우
            leaveRoom();
            return;
        }
        
        // ⛔️ [AI] AI가 아닌 플레이어만 UI에 렌더링 (AI는 opponentHand에 포함됨)
        if (roomData.players && roomData.players[currentPlayer.id]) {
            updatePlayerHands(roomData.players, roomData);
        }
        updateGameBoard(roomData);

        // 방장인 경우에만 게임 시작 버튼 표시
        if (roomData.host === currentPlayer.id && roomData.state === 'waiting') {
            startGameBtn.style.display = 'block';
        } else {
            startGameBtn.style.display = 'none';
        }

        // ⛔️ [AI] AI 턴 처리 로직 (방장만 실행)
        handleAITurn(roomData);
    });
}

function leaveRoom() {
    if (currentPlayer.playerRef) {
        remove(currentPlayer.playerRef);
        onDisconnect(currentPlayer.playerRef).cancel();
    }
    
    // ⛔️ [AI] 방장이 나가면 AI도 함께 제거
    if (currentRoomRef) {
        // 이 부분은 복잡해질 수 있으므로, 방장이 나갈 때 방 자체가 정리되는 로직이 필요할 수 있음
        // 지금은 AI가 포함된 방을 나갈 때의 별도 처리는 생략
    }

    if(currentRoomRef) {
        onValue(currentRoomRef, () => {}); // 리스너 제거
        currentRoomRef = null;
    }

    currentPlayer.roomId = null;
    currentPlayer.playerRef = null;
    
    // ⛔️ [AI] 로컬 API 키 초기화
    localGeminiKey = null;

    gameLobby.style.display = 'block';
    gameRoom.style.display = 'none';
}

leaveRoomBtn.addEventListener('click', leaveRoom);

function updatePlayerHands(players, roomData) {
    if (!players || !roomData) return;

    opponentHand.innerHTML = '';
    myHand.innerHTML = '';

    // ⛔️ [AI] AI 플레이어를 제외한 실제 플레이어 ID 목록
    const playerIds = Object.keys(players).filter(id => !players[id].isAI);
    const myPlayerIndex = playerIds.indexOf(currentPlayer.id);

    // ⛔️ [AI] AI 플레이어 ID 목록
    const aiPlayerIds = Object.keys(players).filter(id => players[id].isAI);

    // ⛔️ [AI] UI 표시 순서: 나 -> 다른 플레이어 -> AI
    const orderedPlayerIds = [
        ...playerIds.slice(myPlayerIndex), 
        ...playerIds.slice(0, myPlayerIndex)
    ];

    // 나와 다른 사람 플레이어 렌더링
    orderedPlayerIds.forEach(playerId => {
        const player = players[playerId];
        const hand = player.hand || {};
        const cardCount = Object.keys(hand).length;
        const isCurrentTurn = roomData.currentPlayerTurn === playerId;

        const playerContainer = document.createElement('div');
        playerContainer.className = 'player-container';
        if (isCurrentTurn) {
            playerContainer.classList.add('active-turn');
        }

        if (playerId === currentPlayer.id) {
            // 내 손
            playerContainer.innerHTML = `<div class="player-name">${player.name} (나)</div>`;
            const myHandDiv = document.createElement('div');
            myHandDiv.className = 'player-hand';
            for (const cardId in hand) {
                const card = hand[cardId];
                const cardDiv = createCardDiv(card);
                myHandDiv.appendChild(cardDiv);
            }
            playerContainer.appendChild(myHandDiv);
            myHand.appendChild(playerContainer);
        } else {
            // 다른 사람 (상대방)
            playerContainer.innerHTML = `<div class="player-name">${player.name} (${cardCount}장)</div>`;
            const opponentCardsDiv = document.createElement('div');
            opponentCardsDiv.className = 'player-hand';
            for (let i = 0; i < cardCount; i++) {
                const cardDiv = createCardDiv({ back: true });
                opponentCardsDiv.appendChild(cardDiv);
            }
            playerContainer.appendChild(opponentCardsDiv);
            opponentHand.appendChild(playerContainer);
        }
    });
    
    // AI 플레이어 렌더링 (항상 상대방)
    aiPlayerIds.forEach(aiPlayerId => {
        const player = players[aiPlayerId];
        const hand = player.hand || {};
        const cardCount = Object.keys(hand).length;
        const isCurrentTurn = roomData.currentPlayerTurn === aiPlayerId;
        
        const playerContainer = document.createElement('div');
        playerContainer.className = 'player-container ai-player'; // AI 식별 클래스
        if (isCurrentTurn) {
            playerContainer.classList.add('active-turn');
        }
        
        playerContainer.innerHTML = `<div class="player-name">${player.name} (${cardCount}장)</div>`;
        const opponentCardsDiv = document.createElement('div');
        opponentCardsDiv.className = 'player-hand';
        for (let i = 0; i < cardCount; i++) {
            const cardDiv = createCardDiv({ back: true });
            opponentCardsDiv.appendChild(cardDiv);
        }
        playerContainer.appendChild(opponentCardsDiv);
        opponentHand.appendChild(playerContainer);
    });
}


function updateGameBoard(roomData) {
    if (!roomData) return;
    
    if (roomData.state === 'playing') {
        const discardData = roomData.discardPile || {};
        const topCardId = Object.keys(discardData).pop();
        if (topCardId) {
            const topCard = discardData[topCardId];
            discardPile.innerHTML = '';
            discardPile.appendChild(createCardDiv(topCard));
        }
         // 덱 카드 수 표시
        const deckCount = roomData.deck ? roomData.deck.length : 0;
        const deckElement = document.getElementById('deck');
        deckElement.textContent = `덱 (${deckCount})`;

    } else {
        discardPile.innerHTML = '';
        document.getElementById('deck').textContent = '덱';
    }
    
    // 게임 승리/종료 시 메시지 표시
    if (roomData.state === 'finished') {
        const winner = roomData.winner;
        alert(`${winner}님이 승리했습니다!`);
        leaveRoom();
    }
}

function createCardDiv(card) {
    const cardDiv = document.createElement('div');
    if (card.back) {
        cardDiv.className = 'card back';
        return cardDiv;
    }

    cardDiv.className = `card ${card.suit.toLowerCase()}`;
    cardDiv.dataset.cardId = card.id;
    
    let rank = card.rank;
    let suitSymbol = '';

    // ⛔️ [AI] 7-suit-change 카드 렌더링 수정
    if (card.rank === '7-suit-change') {
        rank = '7'; // 7로 표시
        cardDiv.classList.add('suit-change-effect'); // CSS로 특별한 효과
    }

    if (card.rank === 'Joker') {
        rank = card.color === 'color' ? 'C.J' : 'B.J';
        suitSymbol = '🃏';
        cardDiv.classList.add('joker');
    } else {
        suitSymbol = { heart: '♥', diamond: '♦', club: '♣', spade: '♠' }[card.suit];
        cardDiv.classList.add(card.suit);
    }


    cardDiv.innerHTML = `
        <span class="rank top">${rank}</span>
        <span class="suit">${suitSymbol}</span>
        <span class="rank bottom">${rank}</span>
    `;
    return cardDiv;
}


// --- 게임 플레이 로직 ---

// ⛔️ [AI] 카드 유효성 검사 로직 분리
function canPlayCard(cardToPlay, topCard, currentAttack) {
    const isAttackCard = ['A', '2', 'Joker'].includes(cardToPlay.rank);

    if (currentAttack > 0) {
        // 공격 받는 중: 같은 등급의 공격 카드, 또는 흑백 조커(5), 컬러 조커(7)
        if (isAttackCard) {
            if (topCard.rank === 'Joker') {
                // 조커 공격은 조커로만 방어 가능
                return cardToPlay.rank === 'Joker';
            }
            // A, 2 공격은 A, 2, 조커로 방어 가능
            return cardToPlay.rank === topCard.rank || cardToPlay.rank === 'Joker';
        }
        return false; // 공격 중에는 공격 카드 외에는 낼 수 없음
    } else {
        // 일반 상황: 무늬 또는 등급이 같거나, 조커 카드일 경우
        return cardToPlay.suit === topCard.suit || 
               cardToPlay.rank === topCard.rank || 
               cardToPlay.rank === 'Joker' ||
               topCard.rank === '7-suit-change'; // 7-suit-change 카드가 위면 무늬만 맞추면 됨
    }
}


// 내 손의 카드 클릭
myHand.addEventListener('click', (e) => {
    const cardDiv = e.target.closest('.card');
    if (!cardDiv || !cardDiv.dataset.cardId) return;

    const cardId = cardDiv.dataset.cardId;
    handlePlayCard(currentPlayer.id, cardId);
});

// 덱 클릭
const deckPile = document.getElementById('deck');
deckPile.addEventListener('click', () => {
    handleDrawCard(currentPlayer.id);
});


// ⛔️ [AI] 카드 내기 로직 (플레이어 ID 기반으로 변경)
function handlePlayCard(playerId, cardId, chosenSuit = null) {
    runTransaction(currentRoomRef, (room) => {
        if (!room || room.state !== 'playing') return;
        if (room.currentPlayerTurn !== playerId) {
            // 사람이 클릭한 경우에만 경고
            if (playerId === currentPlayer.id) alert('당신의 턴이 아닙니다.');
            return;
        }
        if (!room.players[playerId] || !room.players[playerId].hand[cardId]) {
             // AI가 없는 카드를 내려고 할 수 있음 (환각)
            console.warn(`[${playerId}]가 손에 없는 카드(${cardId})를 내려고 시도했습니다.`);
            return; // 트랜잭션 중단
        }

        const cardToPlay = room.players[playerId].hand[cardId];
        const topCard = Object.values(room.discardPile).pop();
        const currentAttack = room.attackStack || 0;

        // ⛔️ [AI] 분리된 유효성 검사 함수 사용
        if (!canPlayCard(cardToPlay, topCard, currentAttack)) {
            if (playerId === currentPlayer.id) alert('낼 수 없는 카드입니다.');
            return;
        }

        // 카드 이동
        delete room.players[playerId].hand[cardId];
        room.discardPile[cardId] = cardToPlay;
        
        // 승리 조건 확인
        if (Object.keys(room.players[playerId].hand).length === 0) {
            room.state = 'finished';
            room.winner = room.players[playerId].name;
            return room;
        }

        // 특수 카드 로직
        const playerIds = Object.keys(room.players); // ⛔️ [AI] AI 포함된 전체 플레이어
        let currentPlayerIndex = playerIds.indexOf(playerId);
        let nextPlayerIndex = (currentPlayerIndex + 1) % playerIds.length;
        
        const isAttackCard = ['A', '2', 'Joker'].includes(cardToPlay.rank);

        if (isAttackCard) {
            switch (cardToPlay.rank) {
                case 'A': room.attackStack = (room.attackStack || 0) + 3; break;
                case '2': room.attackStack = (room.attackStack || 0) + 2; break;
                case 'Joker': room.attackStack = (room.attackStack || 0) + (cardToPlay.color === 'color' ? 7 : 5); break;
            }
        } else {
             // 일반 카드 처리
            switch (cardToPlay.rank) {
                case 'J': nextPlayerIndex = (nextPlayerIndex + 1) % playerIds.length; break;
                case 'Q': 
                    // ⛔️ [AI] Q 로직 수정 (방향 전환 플래그 사용이 더 간단하나, 기존 로직 유지)
                    // (이전 로직은 플레이어 순서가 고정되어 있다는 가정 하에 작동하므로, AI가 껴도 동일하게 작동)
                    const reversedPlayerIds = [...playerIds].reverse();
                    const reversedCurrentIndex = reversedPlayerIds.indexOf(playerId);
                    const reversedNextPlayerIndex = (reversedCurrentIndex + 1) % reversedPlayerIds.length;
                    const nextPlayerId = reversedPlayerIds[reversedNextPlayerIndex];
                    nextPlayerIndex = playerIds.indexOf(nextPlayerId);
                    break;
                case 'K': nextPlayerIndex = currentPlayerIndex; break; // 턴 유지
                case '7': 
                    let newSuit = null;
                    if (playerId === currentPlayer.id) {
                        // 사람이 7을 냄
                        newSuit = prompt('변경할 무늬를 입력하세요 (heart, diamond, club, spade)');
                    } else {
                        // AI가 7을 냄
                        newSuit = chosenSuit; // Gemini가 선택한 무늬
                    }
                    
                    if (['heart', 'diamond', 'club', 'spade'].includes(newSuit)) {
                        const suitChangeCardId = `suit_change_${Date.now()}`;
                        // ⛔️ [AI] 7-suit-change 카드는 원본 카드의 ID를 가지지 않도록 수정 (ID 중복 방지)
                        room.discardPile[suitChangeCardId] = { id: suitChangeCardId, suit: newSuit, rank: '7-suit-change' };
                    } else {
                        if (playerId === currentPlayer.id) alert('잘못된 무늬입니다. 기본 무늬로 유지됩니다.');
                        // AI가 잘못된 무늬를 줬거나 사람이 취소하면, 그냥 7 카드만 낸 걸로.
                    }
                    break;
            }
        }
        
        room.currentPlayerTurn = playerIds[nextPlayerIndex];
        return room;
    });
}

// ⛔️ [AI] 카드 뽑기 로직 (플레이어 ID 기반으로 변경)
function handleDrawCard(playerId) {
     runTransaction(currentRoomRef, (room) => {
        if (!room || room.state !== 'playing') return;
        if (room.currentPlayerTurn !== playerId) return;
        if (!room.players[playerId]) return; // 방금 나간 플레이어일 수 있음

        const currentAttack = room.attackStack || 0;
        if (currentAttack > 0) {
            // 공격 스택만큼 카드 먹기
            for (let i = 0; i < currentAttack; i++) {
                if (room.deck && room.deck.length > 0) {
                    const drawnCard = room.deck.pop();
                    if (!room.players[playerId].hand) room.players[playerId].hand = {}; // 방어 코드
                    room.players[playerId].hand[drawnCard.id] = drawnCard;
                } else {
                    // ⛔️ [AI] 덱 리필 로직 (간단하게)
                    if (Object.keys(room.discardPile).length > 1) {
                        room = refillDeck(room);
                        i--; // 다시 뽑기
                    } else {
                        break; // 더 이상 뽑을 카드 없음
                    }
                }
            }
            room.attackStack = 0; // 공격 스택 초기화
        } else {
            // 일반 드로우
            if (room.deck && room.deck.length > 0) {
                const drawnCard = room.deck.pop();
                if (!room.players[playerId].hand) room.players[playerId].hand = {};
                room.players[playerId].hand[drawnCard.id] = drawnCard;
            } else {
                 if (Object.keys(room.discardPile).length > 1) {
                    room = refillDeck(room);
                    const drawnCard = room.deck.pop();
                    if (!room.players[playerId].hand) room.players[playerId].hand = {};
                    room.players[playerId].hand[drawnCard.id] = drawnCard;
                 } else {
                    if (playerId === currentPlayer.id) alert('덱에 카드가 없습니다!');
                 }
            }
        }

        // 턴 넘기기
        const playerIds = Object.keys(room.players);
        const currentPlayerIndex = playerIds.indexOf(playerId);
        const nextPlayerIndex = (currentPlayerIndex + 1) % playerIds.length;
        room.currentPlayerTurn = playerIds[nextPlayerIndex];

        return room;
    });
}

// ⛔️ [AI] 덱 리필 함수
function refillDeck(room) {
    console.log("덱 리필 실행!");
    const discardKeys = Object.keys(room.discardPile);
    const topCardId = discardKeys.pop(); // 맨 위 카드 ID
    const topCard = room.discardPile[topCardId]; // 맨 위 카드 객체

    // 나머지 카드들
    const cardsToShuffle = discardKeys.map(key => room.discardPile[key]);
    shuffleDeck(cardsToShuffle);

    room.deck = (room.deck || []).concat(cardsToShuffle); // 기존 덱에 합치기
    room.discardPile = { [topCardId]: topCard }; // 맨 위 카드만 남기기
    
    return room;
}


// --- 게임 시작 로직 ---
startGameBtn.addEventListener('click', () => {
    runTransaction(currentRoomRef, (room) => {
        if (room && room.state === 'waiting' && room.host === currentPlayer.id) {
            const playerIds = Object.keys(room.players);
            // ⛔️ [AI] AI 포함 2명 이상이면 시작 가능
            if (playerIds.length < 2) {
                alert('플레이어가 2명 이상이어야 게임을 시작할 수 있습니다.');
                return; // Abort transaction
            }

            // 1. 덱 생성 및 셔플
            const deck = createDeck();
            shuffleDeck(deck);

            // 2. 카드 분배
            const cardsToDeal = playerIds.length <= 4 ? 7 : 5;
            playerIds.forEach(playerId => {
                room.players[playerId].hand = {};
                for (let i = 0; i < cardsToDeal; i++) {
                    const card = deck.pop();
                    room.players[playerId].hand[card.id] = card;
                }
            });

            // 3. 첫 번째 버리는 카드 설정
            let discardCard = deck.pop();
            while (['A', '2', 'Joker', 'J', 'Q', 'K', '7'].includes(discardCard.rank)) {
                deck.unshift(discardCard); // 덱 맨 밑으로
                discardCard = deck.pop();
            }
            
            room.deck = deck;
            room.discardPile = { [discardCard.id]: discardCard };
            room.currentPlayerTurn = playerIds[0]; // 첫 플레이어부터 시작
            room.state = 'playing';
            room.attackStack = 0; // 공격 스택 초기화
        }
        return room;
    });
});

function createDeck() {
    const suits = ['heart', 'diamond', 'club', 'spade'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let deck = [];
    let id = 0;
    for (const suit of suits) {
        for (const rank of ranks) {
            deck.push({ id: `card_${id++}`, suit, rank });
        }
    }
    deck.push({ id: `card_${id++}`, suit: 'joker', rank: 'Joker', color: 'black' });
    deck.push({ id: `card_${id++}`, suit: 'joker', rank: 'Joker', color: 'color' });
    return deck;
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}


// ===========================================
// ⛔️ [AI] Gemini AI 로직 섹션
// ===========================================

/**
 * AI 턴인지 감지하고, 방장인 경우 AI 로직을 실행하는 메인 핸들러
 */
function handleAITurn(room) {
    if (!room || room.state !== 'playing' || !room.players) return;

    const aiPlayerId = room.currentPlayerTurn;
    const currentPlayer = room.players[aiPlayerId];

    // 1. AI 턴인가?
    // 2. 내가 방장인가? (방장만 AI를 제어)
    // 3. 로컬 API 키가 있는가?
    // 4. AI가 이미 생각 중이 아닌가?
    if (currentPlayer && currentPlayer.isAI && 
        room.host === currentPlayer.id && 
        localGeminiKey && 
        !isAiThinking) 
    {
        isAiThinking = true; // 락(Lock) 설정
        console.log("Gemini AI가 생각 중입니다...");

        // 1초 딜레이 (너무 빠르면 사람이 인지 못함)
        setTimeout(() => {
            runGeminiAI(room, localGeminiKey)
                .then(move => {
                    // Gemini가 제안한 행동(move) 검증
                    const validation = validateAIMove(room, move, aiPlayerId);

                    if (validation.isValid) {
                        if (move.action === 'play') {
                            console.log(`AI가 ${validation.card.suit} ${validation.card.rank}를 냅니다.`);
                            handlePlayCard(aiPlayerId, validation.card.id, move.changeSuitTo);
                        } else {
                            console.log("AI가 카드를 뽑습니다.");
                            handleDrawCard(aiPlayerId);
                        }
                    } else {
                        // Gemini가 헛소리(환각)를 하거나 낼 카드가 없음
                        console.warn("AI의 제안이 유효하지 않음:", move, "이유:", validation.reason);
                        console.log("AI가 대신 카드를 뽑습니다.");
                        handleDrawCard(aiPlayerId);
                    }
                })
                .catch(err => {
                    console.error("Gemini AI 실행 오류:", err);
                    console.log("AI 오류로 인해 카드를 뽑습니다.");
                    handleDrawCard(aiPlayerId); // 오류 시 강제 드로우
                })
                .finally(() => {
                    // Firebase DB 업데이트가 onValue를 다시 트리거할 시간을 주기 위해 딜레이
                    setTimeout(() => { isAiThinking = false; }, 1000);
                });
        }, 1000);
    }
}

/**
 * Gemini API를 호출하여 AI의 다음 행동을 결정
 */
async function runGeminiAI(room, apiKey) {
    const aiPlayerId = room.currentPlayerTurn;
    const aiHand = Object.values(room.players[aiPlayerId].hand || {});
    const topCard = Object.values(room.discardPile).pop();
    const attackStack = room.attackStack || 0;

    // 1. AI가 낼 수 있는 카드가 있는지 먼저 확인 (프롬프트 최적화)
    const playableCards = aiHand.filter(card => canPlayCard(card, topCard, attackStack));
    
    // 2. 프롬프트 생성
    const prompt = `
        당신은 원카드(One Card) 게임의 AI 플레이어입니다.
        현재 게임 상황에 맞춰 *반드시* 다음 JSON 형식 중 하나로만 응답하세요.
        다른 설명은 절대 추가하지 마세요.

        1. 카드 내기: {"action": "play", "suit": "heart", "rank": "5"}
        2. 카드 뽑기: {"action": "draw"}
        3. (만약 7 카드를 낸다면): {"action": "play", "suit": "club", "rank": "7", "changeSuitTo": "spade"}

        [게임 규칙 요약]
        - 낼 수 있는 카드: 버려진 카드와 모양(suit) 또는 숫자(rank)가 같아야 함.
        - 공격 카드(A: 3장, 2: 2장, Joker: 5/7장): 공격 스택(attackStack)이 0일 때만 낼 수 있음.
        - 공격 방어: attackStack > 0일 때는 A, 2, Joker로만 방어 가능. (같은 랭크 또는 조커)
        - J: 턴 점프, Q: 턴 역행, K: 턴 유지 (한 번 더)
        - 7: 낸 뒤 원하는 모양으로 변경.
        - 낼 카드가 없으면 'draw'해야 함.

        [현재 상황]
        - 내 손 패(AI): ${aiHand.map(c => `${c.suit} ${c.rank}`).join(', ') || '없음'}
        - 버려진 카드(맨 위): ${topCard.suit} ${topCard.rank}
        - 누적된 공격 스택: ${attackStack} 장
        - 낼 수 있는 카드 목록: ${playableCards.map(c => `${c.suit} ${c.rank}`).join(', ') || '없음'}
        - 다른 플레이어 카드 수: ${Object.values(room.players).filter(p => !p.isAI && p.id !== aiPlayerId).map(p => `${p.name}: ${Object.keys(p.hand || {}).length}장`).join(', ')}

        [지시]
        1. 낼 수 있는 카드 목록(${playableCards.length > 0 ? '있음' : '없음'})을 확인하세요.
        2. 낼 카드가 없으면 {"action": "draw"}를 반환하세요.
        3. 낼 카드가 있다면, 목록 중 가장 전략적인 카드 1개를 골라 JSON 형식으로 반환하세요.
        4. (전략 팁: 공격 카드를 우선적으로 방어하거나, K/J/Q/7을 적절히 사용하세요.)
        
        JSON 응답만 하세요:
    `;

    // 3. Gemini API 호출
    const url = `https://generativelace.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ],
            generationConfig: {
                temperature: 0.8, // 약간의 무작위성
                maxOutputTokens: 256,
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Gemini API 오류: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // 4. 응답 파싱
    try {
        const aiResponseText = data.candidates[0].content.parts[0].text;
        // JSON 문자열만 추출 (Gemini가 ```json ... ``` 등으로 감쌀 수 있음)
        const jsonMatch = aiResponseText.match(/\{.*\}/s);
        if (!jsonMatch) {
            console.error("Gemini가 JSON을 반환하지 않음:", aiResponseText);
            return { action: 'draw' }; // 오류 시 강제 드로우
        }
        return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.error("Gemini 응답 파싱 오류:", e, data);
        return { action: 'draw' }; // 오류 시 강제 드로우
    }
}

/**
 * Gemini의 응답이 유효한지 (규칙 위반, 환각) 검증
 */
function validateAIMove(room, move, aiPlayerId) {
    if (!move || !move.action) {
        return { isValid: false, reason: "알 수 없는 행동" };
    }

    const aiHandList = Object.values(room.players[aiPlayerId].hand || {});
    const topCard = Object.values(room.discardPile).pop();
    const attackStack = room.attackStack || 0;

    if (move.action === 'draw') {
        // AI가 'draw'를 선택했으면, 낼 수 있는 카드가 있어도 일단 유효한 것으로 간주 (전략일 수 있음)
        return { isValid: true };
    }

    if (move.action === 'play') {
        if (!move.suit || !move.rank) {
            return { isValid: false, reason: "카드가 특정되지 않음" };
        }

        // 1. AI가 그 카드를 정말 가지고 있는가?
        const cardInHand = aiHandList.find(c => c.suit === move.suit && c.rank === move.rank);
        if (!cardInHand) {
            return { isValid: false, reason: "손에 없는 카드 (환각)" };
        }

        // 2. 그 카드를 지금 낼 수 있는가? (규칙 검증)
        if (!canPlayCard(cardInHand, topCard, attackStack)) {
            return { isValid: false, reason: "낼 수 없는 카드 (규칙 위반)" };
        }
        
        // 3. 7카드 검증
        if (cardInHand.rank === '7') {
            if (!['heart', 'diamond', 'club', 'spade'].includes(move.changeSuitTo)) {
                return { isValid: false, reason: "7카드 무늬 변경(changeSuitTo) 오류" };
            }
        }

        return { isValid: true, card: cardInHand };
    }
    
    return { isValid: false, reason: "알 수 없는 행동" };
}

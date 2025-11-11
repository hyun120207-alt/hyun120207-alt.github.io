// Firebase SDK 가져오기
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getDatabase, ref, push, onValue, set, remove, onDisconnect, runTransaction } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-database.js";

// Firebase 설정
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
const app = initializeApp(firebaseConfig, "onecard-game"); 
const database = getDatabase(app);

// DOM 요소
const gameLobby = document.getElementById('game-lobby');
const roomList = document.getElementById('room-list');
const createRoomBtn = document.getElementById('create-room-btn');
const roomNameInput = document.getElementById('room-name-input');
// ⛔️ [AI] AI 관련 DOM 요소
const aiCheckbox = document.getElementById('ai-checkbox');
const geminiApiKeyInput = document.getElementById('gemini-api-key-input');
const geminiModelSelect = document.getElementById('gemini-model-select');

const gameRoom = document.getElementById('game-room');
const roomTitle = document.getElementById('room-title');
const startGameBtn = document.getElementById('start-game-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const opponentHand = document.getElementById('opponent-hand');
const myHand = document.getElementById('my-hand');
const discardPile = document.getElementById('discard-pile');
const deckPile = document.getElementById('deck'); // ⛔️ [버그 수정] deckPile 정의


// Firebase 참조
const roomsRef = ref(database, 'onecard_rooms');
// ⛔️ [버그 수정] 'currentPlayer'는 이 브라우저의 유저 정보를 담는 *전역* 객체
let currentPlayer = {
    id: `player_${Date.now()}`, 
    name: null,
    roomId: null,
    playerRef: null
};
let currentRoomRef = null;

// ⛔️ [AI] AI 관련 전역 변수
let localGeminiKey = null; 
let localGeminiModel = null; 
let isAiThinking = false;  
const AI_PLAYER_ID = "player_AI_Gemini";

// ⛔️ [AI] AI 옵션 UI 토글
aiCheckbox.addEventListener('change', () => {
    const isChecked = aiCheckbox.checked;
    geminiApiKeyInput.style.display = isChecked ? 'block' : 'none';
    geminiModelSelect.style.display = isChecked ? 'block' : 'none';
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
        localGeminiModel = geminiModelSelect.value;
        
        if (!localGeminiKey) {
            alert('AI 플레이어를 포함하려면 Gemini API 키를 입력해야 합니다.');
            return;
        }
    }
    
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
        players: {}, 
        state: 'waiting',
        host: currentPlayer.id // 방장 ID 저장
    }).then(() => {
        // 2. [AI] 방장이 AI 플레이어를 DB에 추가
        if (isWithAI) {
            const aiPlayerRef = ref(database, `onecard_rooms/${roomId}/players/${AI_PLAYER_ID}`);
            set(aiPlayerRef, { 
                name: `Gemini AI (${localGeminiModel.replace('gemini-', '')})`, 
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
    geminiModelSelect.style.display = 'none';
    geminiApiKeyInput.value = '';
});


// 방 목록 실시간 업데이트
onValue(roomsRef, (snapshot) => {
    roomList.innerHTML = '';
    if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
            const roomId = childSnapshot.key;
            const roomData = childSnapshot.val();
            const playerCount = roomData.players ? Object.keys(roomData.players).length : 0;
            
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

    // 방 정보 감시 (핵심 리스너)
    onValue(currentRoomRef, (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData) { 
            leaveRoom();
            return;
        }
        
        // UI 업데이트
        if (roomData.players && roomData.players[currentPlayer.id]) {
            updatePlayerHands(roomData.players, roomData);
        } else if (!roomData.players[currentPlayer.id] && roomData.state === 'playing') {
            // 게임 도중 나갔거나 킥당한 경우
            leaveRoom();
        }
        
        updateGameBoard(roomData);

        // 방장인 경우에만 게임 시작 버튼 표시
        // ⛔️ [버그 수정] 이 검사는 전역 currentPlayer.id와 DB의 roomData.host를 비교 (정상)
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

    if(currentRoomRef) {
        onValue(currentRoomRef, () => {}); 
        currentRoomRef = null;
    }

    currentPlayer.roomId = null;
    currentPlayer.playerRef = null;
    
    // ⛔️ [AI] 로컬 API 키 및 모델 초기화
    localGeminiKey = null;
    localGeminiModel = null; 

    gameLobby.style.display = 'block';
    gameRoom.style.display = 'none';
}

leaveRoomBtn.addEventListener('click', leaveRoom);

// (updatePlayerHands, updateGameBoard, createCardDiv... UI 로직은 문제 없음)
function updatePlayerHands(players, roomData) {
    if (!players || !roomData) return;

    opponentHand.innerHTML = '';
    myHand.innerHTML = '';

    const playerIds = Object.keys(players).filter(id => !players[id].isAI);
    const myPlayerIndex = playerIds.indexOf(currentPlayer.id);

    const aiPlayerIds = Object.keys(players).filter(id => players[id].isAI);

    const opponentPlayerIds = [
        ...playerIds.slice(myPlayerIndex + 1), 
        ...playerIds.slice(0, myPlayerIndex)
    ];

    opponentPlayerIds.forEach(playerId => {
        const player = players[playerId];
        const hand = player.hand || {};
        const cardCount = Object.keys(hand).length;
        const isCurrentTurn = roomData.currentPlayerTurn === playerId;

        const playerContainer = document.createElement('div');
        playerContainer.className = 'player-container';
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
    
    aiPlayerIds.forEach(aiPlayerId => {
        const player = players[aiPlayerId];
        const hand = player.hand || {};
        const cardCount = Object.keys(hand).length;
        const isCurrentTurn = roomData.currentPlayerTurn === aiPlayerId;
        
        const playerContainer = document.createElement('div');
        playerContainer.className = 'player-container ai-player';
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
    
    const myPlayer = players[currentPlayer.id];
    if (myPlayer) {
        const myHandData = myPlayer.hand || {};
        const isMyTurn = roomData.currentPlayerTurn === currentPlayer.id;
        
        const myPlayerContainer = document.createElement('div');
        myPlayerContainer.className = 'player-container';
        if (isMyTurn) {
            myPlayerContainer.classList.add('active-turn');
        }
        myPlayerContainer.innerHTML = `<div class="player-name">${myPlayer.name} (나)</div>`;
        const myHandDiv = document.createElement('div');
        myHandDiv.className = 'player-hand';
        for (const cardId in myHandData) {
            const card = myHandData[cardId];
            const cardDiv = createCardDiv(card);
            myHandDiv.appendChild(cardDiv);
        }
        myPlayerContainer.appendChild(myHandDiv);
        myHand.appendChild(myPlayerContainer);
    }
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
        const deckCount = roomData.deck ? roomData.deck.length : 0;
        deckPile.textContent = `덱 (${deckCount})`; // ⛔️ [버그 수정] deckElement -> deckPile

    } else {
        discardPile.innerHTML = '';
        deckPile.textContent = '덱'; // ⛔️ [버그 수정] deckElement -> deckPile
    }
    
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

    if (card.rank === '7-suit-change') {
        rank = '7'; 
        suitSymbol = { heart: '♥', diamond: '♦', club: '♣', spade: '♠' }[card.suit];
        cardDiv.classList.add('suit-change-effect'); 
        cardDiv.classList.add(card.suit); 
    } else if (card.rank === 'Joker') {
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

function canPlayCard(cardToPlay, topCard, currentAttack) {
    if (!topCard) return true; 

    if (topCard.rank === '7-suit-change') {
        if (currentAttack > 0) {
            return ['A', '2', 'Joker'].includes(cardToPlay.rank);
        } else {
            return cardToPlay.suit === topCard.suit || 
                   cardToPlay.rank === 'Joker' ||
                   cardToPlay.rank === '7';
        }
    }

    const isAttackCard = ['A', '2', 'Joker'].includes(cardToPlay.rank);

    if (currentAttack > 0) {
        if (isAttackCard) {
            if (topCard.rank === 'Joker') {
                return cardToPlay.rank === 'Joker';
            }
            return cardToPlay.rank === topCard.rank || cardToPlay.rank === 'Joker';
        }
        return false;
    } else {
        return cardToPlay.suit === topCard.suit || 
               cardToPlay.rank === topCard.rank || 
               cardToPlay.rank === 'Joker';
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
deckPile.addEventListener('click', () => {
    handleDrawCard(currentPlayer.id);
});


// ⛔️ [버그 수정] handlePlayCard, handleDrawCard 내부의
//  alerts/prompts가 playerID === currentPlayer.id (즉, '나')일 때만
// 표시되도록 수정
function handlePlayCard(playerId, cardId, chosenSuit = null) {
    runTransaction(currentRoomRef, (room) => {
        if (!room || room.state !== 'playing') return;
        if (room.currentPlayerTurn !== playerId) {
            if (playerId === currentPlayer.id) alert('당신의 턴이 아닙니다.');
            return;
        }
        if (!room.players[playerId] || !room.players[playerId].hand[cardId]) {
            console.warn(`[${playerId}]가 손에 없는 카드(${cardId})를 내려고 시도했습니다.`);
            return; 
        }

        const cardToPlay = room.players[playerId].hand[cardId];
        const discardKeys = Object.keys(room.discardPile);
        const topCardId = discardKeys[discardKeys.length - 1];
        const topCard = room.discardPile[topCardId];
        
        const currentAttack = room.attackStack || 0;

        if (!canPlayCard(cardToPlay, topCard, currentAttack)) {
            if (playerId === currentPlayer.id) alert('낼 수 없는 카드입니다.');
            return;
        }

        delete room.players[playerId].hand[cardId];
        room.discardPile[cardId] = cardToPlay;
        
        if (Object.keys(room.players[playerId].hand).length === 0) {
            room.state = 'finished';
            room.winner = room.players[playerId].name;
            return room;
        }

        const playerIds = Object.keys(room.players); 
        let currentPlayerIndex = playerIds.indexOf(playerId);
        
        if (typeof room.turnDirection === 'undefined') {
            room.turnDirection = 1; 
        }
        
        let nextPlayerIndex = (currentPlayerIndex + (room.turnDirection * 1) + playerIds.length) % playerIds.length;
        
        const isAttackCard = ['A', '2', 'Joker'].includes(cardToPlay.rank);

        if (isAttackCard) {
            switch (cardToPlay.rank) {
                case 'A': room.attackStack = (room.attackStack || 0) + 3; break;
                case '2': room.attackStack = (room.attackStack || 0) + 2; break;
                case 'Joker': room.attackStack = (room.attackStack || 0) + (cardToPlay.color === 'color' ? 7 : 5); break;
            }
        } else {
            switch (cardToPlay.rank) {
                case 'J': 
                    nextPlayerIndex = (currentPlayerIndex + (room.turnDirection * 2) + playerIds.length) % playerIds.length; 
                    break;
                case 'Q': 
                    room.turnDirection *= -1; 
                    nextPlayerIndex = (currentPlayerIndex + (room.turnDirection * 1) + playerIds.length) % playerIds.length;
                    break;
                case 'K': 
                    nextPlayerIndex = currentPlayerIndex; 
                    break; 
                case '7': 
                    let newSuit = null;
                    if (playerId === currentPlayer.id) { // ⛔️ '나'일 때만 프롬프트
                        newSuit = prompt('변경할 무늬를 입력하세요 (heart, diamond, club, spade)');
                    } else {
                        newSuit = chosenSuit; 
                    }
                    
                    if (['heart', 'diamond', 'club', 'spade'].includes(newSuit)) {
                        const suitChangeCardId = `suit_change_${Date.now()}`;
                        room.discardPile[suitChangeCardId] = { 
                            id: suitChangeCardId, 
                            suit: newSuit, 
                            rank: '7-suit-change' 
                        };
                    } else {
                        if (playerId === currentPlayer.id) alert('잘못된 무늬입니다. 7카드의 원래 무늬로 유지됩니다.');
                    }
                    break;
            }
        }
        
        room.currentPlayerTurn = playerIds[nextPlayerIndex];
        return room;
    });
}

function handleDrawCard(playerId) {
     runTransaction(currentRoomRef, (room) => {
        if (!room || room.state !== 'playing') return;
        if (room.currentPlayerTurn !== playerId) return;
        if (!room.players[playerId]) return; 

        const currentAttack = room.attackStack || 0;
        if (currentAttack > 0) {
            for (let i = 0; i < currentAttack; i++) {
                if (!room.deck || room.deck.length === 0) {
                    room = refillDeck(room);
                    if (!room.deck || room.deck.length === 0) {
                        break; 
                    }
                }
                const drawnCard = room.deck.pop();
                if (!room.players[playerId].hand) room.players[playerId].hand = {};
                room.players[playerId].hand[drawnCard.id] = drawnCard;
            }
            room.attackStack = 0; 
        } else {
            if (!room.deck || room.deck.length === 0) {
                room = refillDeck(room);
            }
            
            if (room.deck && room.deck.length > 0) {
                const drawnCard = room.deck.pop();
                if (!room.players[playerId].hand) room.players[playerId].hand = {};
                room.players[playerId].hand[drawnCard.id] = drawnCard;
            } else {
                 // ⛔️ '나'일 때만 알림
                if (playerId === currentPlayer.id) alert('덱에 카드가 없습니다!');
            }
        }

        const playerIds = Object.keys(room.players);
        const currentPlayerIndex = playerIds.indexOf(playerId);
        
        if (typeof room.turnDirection === 'undefined') room.turnDirection = 1;
        const nextPlayerIndex = (currentPlayerIndex + room.turnDirection + playerIds.length) % playerIds.length;
        
        room.currentPlayerTurn = playerIds[nextPlayerIndex];

        return room;
    });
}

function refillDeck(room) {
    console.log("덱 리필 실행!");
    const discardKeys = Object.keys(room.discardPile);
    if (discardKeys.length <= 1) {
        console.warn("리필할 카드가 부족합니다.");
        return room;
    }

    const topCardId = discardKeys.pop(); 
    const topCard = room.discardPile[topCardId]; 

    const cardsToShuffle = discardKeys.map(key => room.discardPile[key]);
    shuffleDeck(cardsToShuffle);

    room.deck = (room.deck || []).concat(cardsToShuffle); 
    room.discardPile = { [topCardId]: topCard }; 
    
    return room;
}


// --- 게임 시작 로직 ---
startGameBtn.addEventListener('click', () => {
    runTransaction(currentRoomRef, (room) => {
        // ⛔️ [버그 수정] 이 검사는 전역 currentPlayer.id와 DB의 room.host를 비교 (정상)
        if (room && room.state === 'waiting' && room.host === currentPlayer.id) {
            const playerIds = Object.keys(room.players);
            if (playerIds.length < 2) {
                alert('플레이어가 2명 이상이어야 게임을 시작할 수 있습니다.');
                return; // 트랜잭션 중단
            }

            const deck = createDeck();
            shuffleDeck(deck);

            const cardsToDeal = playerIds.length <= 4 ? 7 : 5;
            playerIds.forEach(playerId => {
                // ⛔️ [버그 수정] room.players[playerId]가 null이 아닌지 확인
                if (room.players[playerId]) { 
                    room.players[playerId].hand = {};
                    for (let i = 0; i < cardsToDeal; i++) {
                        const card = deck.pop();
                        room.players[playerId].hand[card.id] = card;
                    }
                }
            });

            let discardCard = deck.pop();
            while (['A', '2', 'Joker', 'J', 'Q', 'K', '7'].includes(discardCard.rank)) {
                deck.unshift(discardCard);
                discardCard = deck.pop();
            }
            
            room.deck = deck;
            room.discardPile = { [discardCard.id]: discardCard };
            room.currentPlayerTurn = playerIds[0]; 
            room.state = 'playing';
            room.attackStack = 0; 
            room.turnDirection = 1;
        }
        return room; // 수정한 room 객체 반환
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
// ⛔️ [AI] Gemini AI 로직 섹션 (치명적 버그 수정)
// ===========================================

/**
 * AI 턴인지 감지하고, 방장인 경우 AI 로직을 실행하는 메인 핸들러
 */
function handleAITurn(room) {
    // 1. 게임 중이 아니거나, room 데이터가 없으면 즉시 중단
    if (!room || room.state !== 'playing' || !room.players) return;

    // 2. 현재 턴인 플레이어의 ID와 객체 가져오기
    const aiPlayerId = room.currentPlayerTurn;
    const playerWhoseTurnItIs = room.players[aiPlayerId];

    // 3. 이 브라우저의 주인이 방장(Host)인지 확인
    // ⛔️ [버그 수정] 전역 currentPlayer.id (방장 ID)와 room.host를 비교
    const amITheHost = (room.host === currentPlayer.id);

    // 4. AI 턴 조건을 모두 만족하는지 확인
    if (
        playerWhoseTurnItIs &&      // 현재 턴 플레이어가 존재하고
        playerWhoseTurnItIs.isAI && // 그 플레이어가 AI이며
        amITheHost &&               // 내가 방장이고
        localGeminiKey &&           // API 키가 로드되어 있으며
        localGeminiModel &&         // 모델이 선택되었고
        !isAiThinking               // 현재 AI가 생각 중이 아니면
    ) 
    {
        isAiThinking = true; 
        console.log(`Gemini AI (${localGeminiModel})가 생각 중입니다...`);

        setTimeout(() => {
            runGeminiAI(room, localGeminiKey, localGeminiModel)
                .then(move => {
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
                        console.warn("AI의 제안이 유효하지 않음:", move, "이유:", validation.reason);
                        console.log("AI가 대신 카드를 뽑습니다.");
                        handleDrawCard(aiPlayerId);
                    }
                })
                .catch(err => {
                    console.error("Gemini AI 실행 오류:", err);
                    console.log("AI 오류로 인해 카드를 뽑습니다.");
                    handleDrawCard(aiPlayerId); 
                })
                .finally(() => {
                    setTimeout(() => { isAiThinking = false; }, 1000);
                });
        }, 1000);
    }
}

/**
 * Gemini API를 호출하여 AI의 다음 행동을 결정 (선택된 모델 사용)
 */
async function runGeminiAI(room, apiKey, modelName) {
    const aiPlayerId = room.currentPlayerTurn;
    const aiHand = Object.values(room.players[aiPlayerId].hand || {});
    const discardKeys = Object.keys(room.discardPile);
    const topCard = room.discardPile[discardKeys[discardKeys.length - 1]];
    const attackStack = room.attackStack || 0;

    const playableCards = aiHand.filter(card => canPlayCard(card, topCard, attackStack));
    
    const prompt = `
        당신은 원카드(One Card) 게임의 AI 플레이어입니다.
        현재 게임 상황에 맞춰 *반드시* 다음 JSON 형식 중 하나로만 응답하세요.
        다른 설명은 절대 추가하지 마세요.

        1. 카드 내기: {"action": "play", "suit": "heart", "rank": "5"}
        2. 카드 뽑기: {"action": "draw"}
        3. (만약 7 카드를 낸다면): {"action": "play", "suit": "club", "rank": "7", "changeSuitTo": "spade"}

        [게임 규칙 요약]
        - 낼 수 있는 카드: 버려진 카드와 모양(suit) 또는 숫자(rank)가 같아야 함.
        - 7-suit-change 카드: 바닥에 이 카드가 있으면, 표시된 무늬(suit)와 같거나, 7, Joker만 낼 수 있음.
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

    // ⛔️ [AI] 동적 모델 URL
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
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
                temperature: 0.8, 
                maxOutputTokens: 256,
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Gemini API 오류 (${modelName}): ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    try {
        if (!data.candidates || data.candidates.length === 0) {
             console.error("Gemini가 응답을 반환하지 않음 (안전 설정 등 확인):", data);
             return { action: 'draw' };
        }
        const aiResponseText = data.candidates[0].content.parts[0].text;
        const jsonMatch = aiResponseText.match(/\{.*\}/s);
        if (!jsonMatch) {
            console.error("Gemini가 JSON을 반환하지 않음:", aiResponseText);
            return { action: 'draw' }; 
        }
        return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.error("Gemini 응답 파싱 오류:", e, data);
        return { action: 'draw' };
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
    const discardKeys = Object.keys(room.discardPile);
    const topCard = room.discardPile[discardKeys[discardKeys.length - 1]];
    const attackStack = room.attackStack || 0;

    if (move.action === 'draw') {
        return { isValid: true };
    }

    if (move.action === 'play') {
        if (!move.suit || !move.rank) {
            return { isValid: false, reason: "카드가 특정되지 않음" };
        }

        const cardInHand = aiHandList.find(c => c.suit === move.suit && c.rank === move.rank);
        if (!cardInHand) {
            return { isValid: false, reason: "손에 없는 카드 (환각)" };
        }

        if (!canPlayCard(cardInHand, topCard, attackStack)) {
            return { isValid: false, reason: "낼 수 없는 카드 (규칙 위반)" };
        }
        
        if (cardInHand.rank === '7') {
            if (!['heart', 'diamond', 'club', 'spade'].includes(move.changeSuitTo)) {
                console.warn("AI가 7카드 무늬 변경을 누락/오류. 'heart'로 강제 지정.");
                move.changeSuitTo = 'heart'; 
            }
        }

        return { isValid: true, card: cardInHand };
    }
    
    return { isValid: false, reason: "알 수 없는 행동" };
}

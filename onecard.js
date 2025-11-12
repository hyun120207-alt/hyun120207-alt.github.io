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
const deckPile = document.getElementById('deck');
const aiInternalThoughtDisplay = document.getElementById('ai-internal-thought');

// Firebase 참조
const roomsRef = ref(database, 'onecard_rooms');
let currentPlayer = {
    id: `player_${Date.now()}`, 
    name: null,
    roomId: null,
    playerRef: null
};
let currentRoomRef = null;

// AI 관련 전역 변수
let localGeminiKey = null; 
let localGeminiModel = null; 
let isAiThinking = false;  
const AI_PLAYER_ID = "player_AI_Gemini";

// AI 옵션 UI 토글
aiCheckbox.addEventListener('change', () => {
    const isChecked = aiCheckbox.checked;
    geminiApiKeyInput.style.display = isChecked ? 'block' : 'none';
    geminiModelSelect.style.display = isChecked ? 'block' : 'none';
});


// --- 로비 로직 ---

createRoomBtn.addEventListener('click', () => {
    const roomName = roomNameInput.value.trim();
    if (!roomName) {
        alert('방 제목을 입력하세요.');
        return;
    }
    
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

    set(newRoomRef, {
        name: roomName,
        players: {}, 
        state: 'waiting',
        host: currentPlayer.id 
    }).then(() => {
        if (isWithAI) {
            const aiPlayerRef = ref(database, `onecard_rooms/${roomId}/players/${AI_PLAYER_ID}`);
            set(aiPlayerRef, { 
                name: `Gemini AI (${localGeminiModel.replace('gemini-', '')})`, 
                isAI: true, 
                hand: {} 
            });
        }
        enterRoom(roomId, roomName);
    });
    
    roomNameInput.value = '';
    aiCheckbox.checked = false;
    geminiApiKeyInput.style.display = 'none';
    geminiModelSelect.style.display = 'none';
    geminiApiKeyInput.value = '';
});

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

    onValue(currentRoomRef, (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData) { 
            leaveRoom();
            return;
        }
        
        if (roomData.players && roomData.players[currentPlayer.id]) {
            updatePlayerHands(roomData.players, roomData);
        } else if (!roomData.players[currentPlayer.id] && roomData.state === 'playing') {
            leaveRoom();
        }
        
        updateGameBoard(roomData);

        if (roomData.host === currentPlayer.id && roomData.state === 'waiting') {
            startGameBtn.style.display = 'block';
        } else {
            startGameBtn.style.display = 'none';
        }

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
    localGeminiKey = null;
    localGeminiModel = null; 
    aiInternalThoughtDisplay.textContent = '';
    aiInternalThoughtDisplay.style.display = 'none';

    gameLobby.style.display = 'block';
    gameRoom.style.display = 'none';
}

leaveRoomBtn.addEventListener('click', leaveRoom);

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
        if (roomData.topCardId && roomData.discardPile[roomData.topCardId]) {
            const topCard = roomData.discardPile[roomData.topCardId];
            discardPile.innerHTML = '';
            discardPile.appendChild(createCardDiv(topCard));
        }
        const deckCount = roomData.deck ? roomData.deck.length : 0;
        deckPile.textContent = `덱 (${deckCount})`;

        if (roomData.aiInternalThought && roomData.aiInternalThought.thoughts) {
            const thought = roomData.aiInternalThought;
            aiInternalThoughtDisplay.textContent = `--- ${thought.playerName}의 생각 ---\n${thought.thoughts}`;
            aiInternalThoughtDisplay.style.display = 'block';
        } else {
            aiInternalThoughtDisplay.style.display = 'none';
        }

    } else {
        discardPile.innerHTML = '';
        deckPile.textContent = '덱';
        aiInternalThoughtDisplay.style.display = 'none';
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
            // 공격 중일 때는 공격 카드만 낼 수 있음 (기존 로직 유지)
            return ['A', '2', 'Joker'].includes(cardToPlay.rank);
        } else {
            // 7로 무늬가 변경되었을 때:
            // 1. 변경된 무늬와 같은 카드를 내거나
            // 2. 조커를 내거나
            // 3. 또 다른 7 카드를 낼 수 있음 (버그 수정)
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
        // 일반적인 상황: 무늬 또는 랭크가 같거나, 조커일 때 낼 수 있음
        return cardToPlay.suit === topCard.suit || 
               cardToPlay.rank === topCard.rank || 
               cardToPlay.rank === 'Joker';
    }
}


myHand.addEventListener('click', (e) => {
    const cardDiv = e.target.closest('.card');
    if (!cardDiv || !cardDiv.dataset.cardId) return;
    const cardId = cardDiv.dataset.cardId;
    handlePlayCard(currentPlayer.id, cardId);
});

deckPile.addEventListener('click', () => {
    handleDrawCard(currentPlayer.id);
});


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
        const topCard = room.topCardId ? room.discardPile[room.topCardId] : null;
        
        const currentAttack = room.attackStack || 0;

        if (!canPlayCard(cardToPlay, topCard, currentAttack)) {
            if (playerId === currentPlayer.id) alert('낼 수 없는 카드입니다.');
            return;
        }

        delete room.players[playerId].hand[cardId];
        room.discardPile[cardId] = cardToPlay;
        room.topCardId = cardId; // 카드를 낼 때마다 topCardId를 업데이트
        
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
                    if (playerId === currentPlayer.id) {
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
                        room.topCardId = suitChangeCardId; // 7-suit-change 카드를 topCard로 설정
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

    const topCardId = room.topCardId;
    const topCard = room.discardPile[topCardId]; 

    const cardsToShuffle = discardKeys
        .filter(key => key !== topCardId)
        .map(key => room.discardPile[key]);
        
    shuffleDeck(cardsToShuffle);

    room.deck = (room.deck || []).concat(cardsToShuffle); 
    room.discardPile = { [topCardId]: topCard }; 
    
    return room;
}


// --- 게임 시작 로직 ---
startGameBtn.addEventListener('click', () => {
    runTransaction(currentRoomRef, (room) => {
        if (room && room.state === 'waiting' && room.host === currentPlayer.id) {
            const playerIds = Object.keys(room.players);
            if (playerIds.length < 2) {
                alert('플레이어가 2명 이상이어야 게임을 시작할 수 있습니다.');
                return;
            }

            const deck = createDeck();
            shuffleDeck(deck);

            const cardsToDeal = playerIds.length <= 4 ? 7 : 5;
            playerIds.forEach(playerId => {
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
            room.topCardId = discardCard.id; // 맨 위 카드 ID를 명시적으로 설정
            room.currentPlayerTurn = playerIds[0]; 
            room.state = 'playing';
            room.attackStack = 0; 
            room.turnDirection = 1;
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
// ⛔️ [AI 디버그] Gemini AI 로직 수정 (버그 픽스)
// ===========================================

/**
 * AI 턴인지 감지하고, 방장인 경우 AI 로직을 실행하는 메인 핸들러
 */
function handleAITurn(room) {
    if (!room || room.state !== 'playing' || !room.players) return;

    const aiPlayerId = room.currentPlayerTurn;
    const playerWhoseTurnItIs = room.players[aiPlayerId];
    const amITheHost = (room.host === currentPlayer.id);

    if (
        playerWhoseTurnItIs &&      
        playerWhoseTurnItIs.isAI && 
        amITheHost &&               
        localGeminiKey &&           
        localGeminiModel &&         
        !isAiThinking               
    ) 
    {
        isAiThinking = true; 
        
        const topCard = Object.values(room.discardPile).pop();
        console.info(`[AI 턴] ${localGeminiModel} 생각 중...`, {
            topCard: `${topCard.suit} ${topCard.rank}`,
            attackStack: room.attackStack || 0
        });

        setTimeout(() => {
            runGeminiAI(room, localGeminiKey, localGeminiModel)
                .then(response => {
                    const move = response.final_decision || { action: 'draw', reasoning: 'API 응답 구조 오류로 카드를 뽑습니다.' };
                    const thoughts = response.internal_thoughts || 'AI가 생각하는 과정을 기록하지 못했습니다.';

                    if (currentPlayer.roomId) {
                        const aiThoughtRef = ref(database, `onecard_rooms/${currentPlayer.roomId}/aiInternalThought`);
                        set(aiThoughtRef, {
                            playerName: room.players[aiPlayerPlayerId] ? room.players[aiPlayerId].name : 'AI',
                            thoughts: thoughts,
                            timestamp: Date.now()
                        });
                    }

                    console.log("[Gemini 응답 (Raw)]", response);
                    
                    const validation = validateAIMove(room, move, aiPlayerId);

                    console.log("[검증 결과]", {
                        isValid: validation.isValid,
                        reason: validation.reason || 'N/A'
                    });

                    if (validation.isValid) {
                        if (move.action === 'play') {
                            handlePlayCard(aiPlayerId, validation.card.id, move.changeSuitTo);
                        } else {
                            handleDrawCard(aiPlayerId);
                        }
                    } else {
                        handleDrawCard(aiPlayerId);
                    }
                })
                .catch(err => {
                    console.error("Gemini AI 실행 오류:", err);
                    if (currentPlayer.roomId) {
                        const aiThoughtRef = ref(database, `onecard_rooms/${currentPlayer.roomId}/aiInternalThought`);
                        set(aiThoughtRef, {
                            playerName: room.players[aiPlayerId] ? room.players[aiPlayerId].name : 'AI',
                            thoughts: `API 오류 발생: ${err.message}`,
                            timestamp: Date.now()
                        });
                    }
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
    const topCard = room.topCardId ? room.discardPile[room.topCardId] : null;
    const attackStack = room.attackStack || 0;

    const prompt = `
        당신은 'Tree of Thoughts' 추론 기법을 사용하는 세계 최고 수준의 원카드(One Card) AI 전략가입니다.
        당신의 임무는 게임 상황을 분석하고 최적의 행동을 결정하는 것입니다.
        최종 결정을 내리기 전에, 당신의 모든 사고 과정을 포함한 JSON 객체를 반환해야 합니다.

        --- 사고 및 응답 프로세스 ---
        1.  **상황 분석 (Analyze)**: 현재 당신의 패, 버려진 카드, 공격 스택, 다른 플레이어들의 카드 수를 확인합니다.
        2.  **선택지 생성 (Generate Options)**: 분석을 바탕으로, 가능한 전략적인 행동(플레이할 카드, 드로우 등)을 최소 3가지 생성합니다. 각 선택지에 대해 예상되는 결과, 장점과 단점을 명시하세요.
        3.  **규칙 유효성 검증 (Validate Options)**: 생성한 각 선택지가 현재 게임 규칙 하에서 실행 가능한지 스스로 검증합니다. (예: "내가 내려는 '하트 5'는 바닥의 '하트 K'와 무늬가 같으므로 낼 수 있다.") 낼 수 없는 카드는 선택지에서 제외하세요.
        4.  **전략적 평가 (Evaluate)**: 유효한 선택지들을 비교하여, 승리라는 최종 목표에 가장 효과적인 행동이 무엇인지 평가하고 순위를 매깁니다.
        5.  **최종 결정 및 출력 (Decide & Output)**: 가장 순위가 높은 행동을 최종 결정으로 선택합니다. 당신의 모든 사고 과정(1~4단계)을 'internal_thoughts' 필드에 상세히 서술하고, 최종 결정 사항을 'final_decision' 필드에 담아 아래 JSON 형식으로만 응답하세요.

        **응답 JSON 형식:**
        {
          "internal_thoughts": "여기에 1~4단계에 해당하는 당신의 전체 사고 과정을 상세하게 서술합니다. 줄바꿈을 포함한 긴 텍스트 형식입니다.",
          "final_decision": {
            "action": "play" 또는 "draw",
            "suit": "heart",
            "rank": "5",
            "changeSuitTo": "spade",
            "reasoning": "이 행동을 최종 선택한 핵심 이유를 한 문장으로 요약합니다."
          }
        }

        **[현재 게임 상황]**
        - 내 손 패(AI): ${aiHand.map(c => `${c.suit} ${c.rank}`).join(', ') || '없음'}
        - 버려진 카드(맨 위): ${topCard ? `${topCard.suit} ${topCard.rank}` : '없음'}
        - 누적된 공격 스택: ${attackStack} 장
        - 다른 플레이어 카드 수: ${Object.values(room.players).filter(p => !p.isAI && p.id !== aiPlayerId).map(p => `${p.name}: ${Object.keys(p.hand || {}).length}장`).join(', ')}

        이제, 위의 프로세스에 따라 분석을 수행하고 최종 결정 사항을 JSON 객체로 응답하세요:
    `;

    // ✅ [수정 완료] v1beta 엔드포인트를 v1으로 변경하여 404 오류 해결
    const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;
    
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
                temperature: 0.9, 
                maxOutputTokens: 8192,
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
             return { final_decision: { action: 'draw', reasoning: 'API에서 응답이 없어 카드를 뽑습니다.' }};
        }
        const aiResponseText = data.candidates[0].content.parts[0].text;
        const jsonMatch = aiResponseText.match(/\{.*\}/s);
        if (!jsonMatch) {
            console.error("Gemini가 JSON을 반환하지 않음:", aiResponseText);
            return { final_decision: { action: 'draw', reasoning: 'API가 유효한 JSON을 반환하지 않아 카드를 뽑습니다.' }}; 
        }
        return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.error("Gemini 응답 파싱 오류:", e, data);
        return { final_decision: { action: 'draw', reasoning: 'API 응답을 파싱하는 데 실패하여 카드를 뽑습니다.' }};
    }
}

/**
 * Gemini의 응답이 유효한지 (규칙 위반, 환각) 검증
 */
function validateAIMove(room, move, aiPlayerId) {
    if (!move || !move.action) {
        return { isValid: false, reason: "알 수 없는 행동 (No Action)" };
    }

    const aiHandList = Object.values(room.players[aiPlayerId].hand || {});
    const discardKeys = Object.keys(room.discardPile);
    const topCard = room.discardPile[discardKeys[discardKeys.length - 1]];
    const attackStack = room.attackStack || 0;

    if (move.action === 'draw') {
        // ⛔️ [AI 디버그] AI가 'draw'를 선택했을 때, 정말 낼 카드가 없었는지 확인
        const playableCards = aiHandList.filter(card => canPlayCard(card, topCard, attackStack));
        if (playableCards.length > 0) {
            return { isValid: true, reason: "AI가 'draw' 선택 (낼 수 있는 카드가 있었음)" };
        }
        return { isValid: true, reason: "낼 카드가 없어 'draw' (정상)" };
    }

    if (move.action === 'play') {
        if (!move.suit || !move.rank) {
            return { isValid: false, reason: "카드가 특정되지 않음 (Invalid JSON)" };
        }

        const cardInHand = aiHandList.find(c => c.suit === move.suit && c.rank === move.rank);
        if (!cardInHand) {
            return { isValid: false, reason: "손에 없는 카드 (환각)" };
        }

        if (!canPlayCard(cardInHand, topCard, attackStack)) {
            return { isValid: false, reason: `낼 수 없는 카드 (규칙 위반) - (My: ${cardInHand.suit} ${cardInHand.rank}, Top: ${topCard.suit} ${topCard.rank})` };
        }
        
        if (cardInHand.rank === '7') {
            if (!['heart', 'diamond', 'club', 'spade'].includes(move.changeSuitTo)) {
                console.warn("AI가 7카드 무늬 변경을 누락/오류. 'heart'로 강제 지정.");
                move.changeSuitTo = 'heart'; 
            }
        }

        return { isValid: true, card: cardInHand, reason: "정상 플레이" };
    }
    
    return { isValid: false, reason: "알 수 없는 행동 (Unknown Action)" };
}




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

// --- 로비 로직 ---

// 방 만들기
createRoomBtn.addEventListener('click', () => {
    const roomName = roomNameInput.value.trim();
    if (roomName) {
        const newRoomRef = push(roomsRef);
        const roomId = newRoomRef.key;
        set(newRoomRef, {
            name: roomName,
            players: {},
            state: 'waiting',
            host: currentPlayer.id
        }).then(() => {
            enterRoom(roomId, roomName);
        });
        roomNameInput.value = '';
    } else {
        alert('방 제목을 입력하세요.');
    }
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

    // 방 정보 감시 (플레이어, 게임 상태 등)
    onValue(currentRoomRef, (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData) { // 방이 사라진 경우
            leaveRoom();
            return;
        }
        // ⛔️ 수정: roomData를 전달하여 턴 상태를 올바르게 표시
        updatePlayerHands(roomData.players, roomData);
        updateGameBoard(roomData);

        // 방장인 경우에만 게임 시작 버튼 표시
        if (roomData.host === currentPlayer.id && roomData.state === 'waiting') {
            startGameBtn.style.display = 'block';
        } else {
            startGameBtn.style.display = 'none';
        }
    });
}

function leaveRoom() {
    if (currentPlayer.playerRef) {
        remove(currentPlayer.playerRef);
        onDisconnect(currentPlayer.playerRef).cancel();
    }
    
    if(currentRoomRef) {
        onValue(currentRoomRef, () => {}); // 리스너 제거
        currentRoomRef = null;
    }

    currentPlayer.roomId = null;
    currentPlayer.playerRef = null;

    gameLobby.style.display = 'block';
    gameRoom.style.display = 'none';
}

leaveRoomBtn.addEventListener('click', leaveRoom);

function updatePlayerHands(players, roomData) {
    // ⛔️ 수정: roomData가 없을 경우를 대비한 방어 코드
    if (!players || !roomData) return;

    opponentHand.innerHTML = '';
    myHand.innerHTML = '';

    const playerIds = Object.keys(players);
    const myPlayerIndex = playerIds.indexOf(currentPlayer.id);
    
    // 플레이어 순서를 자신을 기준으로 재정렬 (UI 표시용)
    const orderedPlayerIds = [...playerIds.slice(myPlayerIndex), ...playerIds.slice(0, myPlayerIndex)];

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
}

function updateGameBoard(roomData) {
    if (!roomData) return;
    
    if (roomData.state === 'playing') {
        // 💡 수정: topCardId를 사용하여 안정적으로 topCard 정보 가져오기
        const topCardId = roomData.topCardId;
        if (topCardId && roomData.discardPile[topCardId]) {
            const topCard = roomData.discardPile[topCardId];
            discardPile.innerHTML = '';
            const cardDiv = createCardDiv(topCard);
            
            // 💡 추가: 7번 카드로 변경된 무늬가 있다면 표시
            if (roomData.activeSuit) {
                const suitIcon = { heart: '♥', diamond: '♦', club: '♣', spade: '♠' }[roomData.activeSuit];
                cardDiv.innerHTML += `<div style="position: absolute; top: 5px; right: 5px; font-size: 1.5rem; color: ${['heart', 'diamond'].includes(roomData.activeSuit) ? 'red' : 'black'};">${suitIcon}</div>`;
            }
            
            discardPile.appendChild(cardDiv);
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

// 내 손의 카드 클릭
myHand.addEventListener('click', (e) => {
    const cardDiv = e.target.closest('.card');
    if (!cardDiv || !cardDiv.dataset.cardId) return;

    const cardId = cardDiv.dataset.cardId;
    playCard(cardId);
});

// 덱 클릭
const deckPile = document.getElementById('deck');
deckPile.addEventListener('click', () => {
    drawCard();
});


function playCard(cardId) {
    runTransaction(currentRoomRef, (room) => {
        if (!room || room.state !== 'playing' || !room.players[currentPlayer.id].hand[cardId]) return;
        if (room.currentPlayerTurn !== currentPlayer.id) {
            alert('당신의 턴이 아닙니다.');
            return;
        }

        const cardToPlay = room.players[currentPlayer.id].hand[cardId];
        const topCard = room.discardPile[room.topCardId]; // 💡 수정: topCardId로 안정적으로 참조
        const currentAttack = room.attackStack || 0;
        const activeSuit = room.activeSuit; // 💡 추가: 7카드로 변경된 무늬

        // 유효성 검사 로직 개선
        let isValidMove = false;
        const isAttackCard = ['A', '2', 'Joker'].includes(cardToPlay.rank);

        if (currentAttack > 0) {
            // 공격 받는 중: 같은 등급의 공격 카드만 낼 수 있음
            if (isAttackCard && cardToPlay.rank === topCard.rank) {
                isValidMove = true;
            }
        } else if (activeSuit) {
            // 7카드로 무늬가 변경된 경우: 변경된 무늬와 일치하거나, 7카드거나, 조커 카드일 경우
            if (cardToPlay.suit === activeSuit || cardToPlay.rank === '7' || cardToPlay.rank === 'Joker') {
                isValidMove = true;
            }
        } else {
            // 일반 상황: 무늬 또는 등급이 같거나, 조커 카드일 경우
            if (cardToPlay.suit === topCard.suit || cardToPlay.rank === topCard.rank || cardToPlay.rank === 'Joker') {
                isValidMove = true;
            }
        }

        if (!isValidMove) {
            alert('낼 수 없는 카드입니다.');
            return;
        }

        // 카드 이동
        delete room.players[currentPlayer.id].hand[cardId];
        room.discardPile[cardId] = cardToPlay;
        room.topCardId = cardId; // 💡 수정: topCardId를 명시적으로 업데이트
        
        // 7카드로 인해 변경된 무늬가 있었다면 초기화
        if (room.activeSuit) {
            delete room.activeSuit;
        }

        // 승리 조건 확인
        if (Object.keys(room.players[currentPlayer.id].hand).length === 0) {
            room.state = 'finished';
            room.winner = room.players[currentPlayer.id].name;
            return room;
        }

        // 특수 카드 로직
        const playerIds = Object.keys(room.players);
        let currentPlayerIndex = playerIds.indexOf(currentPlayer.id);
        let nextPlayerIndex = (currentPlayerIndex + 1) % playerIds.length;
        
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
                    const reversedPlayerIds = [...playerIds].reverse();
                    const reversedCurrentIndex = reversedPlayerIds.indexOf(currentPlayer.id);
                    const reversedNextPlayerIndex = (reversedCurrentIndex + 1) % reversedPlayerIds.length;
                    const nextPlayerId = reversedPlayerIds[reversedNextPlayerIndex];
                    nextPlayerIndex = playerIds.indexOf(nextPlayerId);
                    break;
                case 'K': nextPlayerIndex = currentPlayerIndex; break; // 턴 유지
                case '7': 
                    // 💡 수정: prompt 대신 activeSuit 상태만 변경 (UI는 추후 개선)
                    const newSuit = prompt('변경할 무늬를 입력하세요 (heart, diamond, club, spade)');
                    if (['heart', 'diamond', 'club', 'spade'].includes(newSuit)) {
                        room.activeSuit = newSuit;
                    } else {
                        alert('잘못된 무늬입니다. 기본 무늬로 유지됩니다.');
                        // 7을 냈지만 무늬 변경을 안한 경우, 원래 무늬가 유지됨
                    }
                    break;
            }
        }
        
        room.currentPlayerTurn = playerIds[nextPlayerIndex];
        return room;
    });
}

function drawCard() {
     runTransaction(currentRoomRef, (room) => {
        if (!room || room.state !== 'playing' || room.currentPlayerTurn !== currentPlayer.id) return;

        const currentAttack = room.attackStack || 0;
        if (currentAttack > 0) {
            // 공격 스택만큼 카드 먹기
            for (let i = 0; i < currentAttack; i++) {
                if (!room.deck || room.deck.length === 0) {
                    // 💡 추가: 덱이 비었으면 버린 덱을 섞어서 새로 만듦
                    const newDeck = shuffleDiscardIntoDeck(room);
                    if (newDeck) room.deck = newDeck;
                    else break; // 섞을 카드도 없으면 중단
                }
                const drawnCard = room.deck.pop();
                room.players[currentPlayer.id].hand[drawnCard.id] = drawnCard;
            }
            room.attackStack = 0; // 공격 스택 초기화
        } else {
            // 일반 드로우
            if (!room.deck || room.deck.length === 0) {
                // 💡 추가: 덱이 비었으면 버린 덱을 섞어서 새로 만듦
                const newDeck = shuffleDiscardIntoDeck(room);
                if (newDeck) room.deck = newDeck;
                else return; // 섞을 카드도 없으면 아무것도 하지 않음
            }
            const drawnCard = room.deck.pop();
            room.players[currentPlayer.id].hand[drawnCard.id] = drawnCard;
        }

        // 턴 넘기기
        const playerIds = Object.keys(room.players);
        const currentPlayerIndex = playerIds.indexOf(currentPlayer.id);
        const nextPlayerIndex = (currentPlayerIndex + 1) % playerIds.length;
        room.currentPlayerTurn = playerIds[nextPlayerIndex];

        return room;
    });
}

// 💡 추가: 버린 덱을 섞어 새 덱으로 만드는 헬퍼 함수
function shuffleDiscardIntoDeck(room) {
    const topCardId = room.topCardId;
    const cardsToShuffle = [];
    for (const cardId in room.discardPile) {
        if (cardId !== topCardId) {
            cardsToShuffle.push(room.discardPile[cardId]);
            delete room.discardPile[cardId];
        }
    }

    if (cardsToShuffle.length === 0) {
        alert('더 이상 카드가 없어 게임이 무승부로 종료됩니다.');
        room.state = 'finished';
        room.winner = '무승부';
        return null;
    }

    shuffleDeck(cardsToShuffle);
    return cardsToShuffle;
}



// --- 게임 시작 로직 ---
startGameBtn.addEventListener('click', () => {
    runTransaction(currentRoomRef, (room) => {
        if (room && room.state === 'waiting' && room.host === currentPlayer.id) {
            const playerIds = Object.keys(room.players);
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
            // 첫 카드가 공격 카드나 특수 카드(J,Q,K,7)이면 덱 맨 밑으로 보내고 다시 뽑기
            while (['A', '2', 'Joker', 'J', 'Q', 'K', '7'].includes(discardCard.rank)) {
                deck.unshift(discardCard);
                discardCard = deck.pop();
            }
            
            room.deck = deck;
            room.discardPile = { [discardCard.id]: discardCard };
            room.topCardId = discardCard.id; // 💡 추가: 첫 카드의 topCardId 설정
            room.currentPlayerTurn = playerIds[0]; // 첫 플레이어부터 시작
            room.state = 'playing';
            room.attackStack = 0; // 공격 스택 초기화
            delete room.activeSuit; // 💡 추가: activeSuit 초기화
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

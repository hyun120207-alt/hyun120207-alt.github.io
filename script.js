document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const chatContainer = document.getElementById('chat-container');

    fileInput.addEventListener('change', handleFileSelect);

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const chatData = JSON.parse(e.target.result);
                displayChat(chatData);
            } catch (error) {
                alert('Error parsing JSON file: ' + error.message);
            }
        };
        reader.readAsText(file);
    }

    function displayChat(chatData) {
        chatContainer.innerHTML = ''; // Clear previous chat

        let lastSpeaker = null;

        chatData.messages.forEach(msg => {
            const messageElement = document.createElement('div');
            messageElement.classList.add('message');

            const contentElement = document.createElement('div');
            contentElement.classList.add('content');

            let currentSpeaker = msg.author;

            // Handle different message types
            if (msg.role === 'system') {
                messageElement.classList.add('system-message');
                contentElement.innerHTML = msg.content; // System content is HTML
                currentSpeaker = null; // System messages don't show a sender name
            } else {
                if (msg.isUser) {
                    messageElement.classList.add('user-message');
                } else {
                    messageElement.classList.add('assistant-message');
                }
                contentElement.textContent = msg.content.trim();
            }

            // Add sender name if it's a new speaker
            if (currentSpeaker && currentSpeaker !== lastSpeaker) {
                const senderElement = document.createElement('div');
                senderElement.classList.add('sender');
                senderElement.textContent = currentSpeaker;
                messageElement.appendChild(senderElement);
            }
            
            messageElement.appendChild(contentElement);
            chatContainer.appendChild(messageElement);

            lastSpeaker = (msg.role !== 'system') ? currentSpeaker : null;
        });

        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
});

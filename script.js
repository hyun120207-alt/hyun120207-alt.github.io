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

        const userProfile = chatData.profile || 'User';
        let lastSpeaker = null; // Tracks the speaker of the immediately preceding message
        let lastAssistantSpeaker = null; // Tracks the last identified assistant speaker for continuations

        chatData.messages.forEach(msg => {
            let currentSpeaker = null;
            let content = msg.content;
            const isUserMessage = (msg.role === 'user'); // Explicitly use role

            const match = content.match(/^\[([^\]]+)\]:\s*/);
            
            if (isUserMessage) {
                currentSpeaker = userProfile;
                // For user messages, clear lastAssistantSpeaker as the context switches
                lastAssistantSpeaker = null; 
            } else { // msg.role is 'assistant'
                if (match) { // Assistant message with an explicit name
                    currentSpeaker = match[1];
                    content = content.substring(match[0].length);
                    lastAssistantSpeaker = currentSpeaker; // Update last assistant speaker for subsequent continuations
                } else { // Assistant message without an explicit name (continuation or first message without name)
                    // If no explicit speaker and it's an assistant role, assume it's a continuation
                    // from the last known assistant speaker.
                    currentSpeaker = lastAssistantSpeaker;
                    // If there was no previous assistant speaker, we can't assign one.
                    // This might happen if the very first message is an assistant continuation without a name.
                }
            }

            const messageElement = document.createElement('div');
            messageElement.classList.add('message');
            
            if (isUserMessage) {
                messageElement.classList.add('user-message');
            } else {
                messageElement.classList.add('assistant-message');
            }

            const senderElement = document.createElement('div');
            senderElement.classList.add('sender');
            
            // Display sender name for assistant messages if it's a new speaker
            // or if the previous message was a user message (context switch)
            if (!isUserMessage && currentSpeaker && currentSpeaker !== lastSpeaker) {
                 senderElement.textContent = currentSpeaker;
            }

            const contentElement = document.createElement('div');
            contentElement.classList.add('content');
            contentElement.textContent = content.trim();
            
            // Only add sender element if it has content (i.e., not an empty string)
            if (senderElement.textContent) {
                 messageElement.appendChild(senderElement);
            }
            messageElement.appendChild(contentElement);
            chatContainer.appendChild(messageElement);

            lastSpeaker = currentSpeaker; // Update the general last speaker for all messages
        });

        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
});

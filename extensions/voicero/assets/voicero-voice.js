/**
 * VoiceroAI Voice Module
 * Handles voice chat functionality
 */

// Voice interface variables
const VoiceroVoice = {
  isRecording: false,
  audioContext: null,
  analyser: null,
  mediaRecorder: null,
  audioChunks: [],
  recordingTimeout: null,
  silenceDetectionTimer: null,
  silenceThreshold: 8, // Lower threshold to increase sensitivity (was 15)
  silenceTime: 0,
  isSpeaking: false,
  hasStartedSpeaking: false,
  currentAudioStream: null,
  isShuttingDown: false,
  manuallyStoppedRecording: false, // New flag to track if user manually stopped recording

  // Initialize the voice module
  init: function () {
    console.log("VoiceroVoice initializing...");

    // Wait for DOM to be ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        // Create the voice interface container if it doesn't exist
        this.createVoiceChatInterface();
        console.log("VoiceroVoice initialized on DOMContentLoaded");
      });
    } else {
      // If DOM is already loaded, create interface immediately
      this.createVoiceChatInterface();
      console.log("VoiceroVoice initialized immediately");
    }
  },

  // Create voice chat interface (HTML structure)
  createVoiceChatInterface: function () {
    console.log("Creating voice chat interface...");

    // Check if voice chat interface AND the messages container already exist
    const existingInterface = document.getElementById("voice-chat-interface");
    const existingMessagesContainer = document.getElementById("voice-messages");

    if (existingInterface && existingMessagesContainer) {
      console.log("Voice chat interface already exists completely");
      return;
    }

    // If the interface exists but is incomplete, remove it so we can recreate it properly
    if (existingInterface && !existingMessagesContainer) {
      console.log(
        "Voice chat interface exists but is incomplete - recreating it",
      );
      existingInterface.remove();
    }

    // First, let's add a specific style reset at the beginning of createVoiceChatInterface
    const resetStyle = document.createElement("style");
    resetStyle.innerHTML = `
      #voice-messages {
        padding: 15px !important; 
        padding-top: 0 !important;
        margin: 0 !important;
      }

      #voice-controls-header {
        margin-bottom: 15px !important;
        margin-top: 0 !important;
      }
    `;
    document.head.appendChild(resetStyle);

    // Create the voice interface container
    const interfaceContainer = document.createElement("div");
    interfaceContainer.id = "voice-chat-interface";
    interfaceContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      width: 85%;
      max-width: 480px;
      min-width: 280px;
      display: none;
      z-index: 2147483647;
      user-select: none;
      margin: 0;
    `;

    // Create messages container
    const messagesContainer = document.createElement("div");
    messagesContainer.id = "voice-messages";
    messagesContainer.setAttribute(
      "style",
      `
      background: white;
      border-radius: 12px 12px 0 0;
      padding: 15px;
      padding-top: 0 !important;
      margin: 0 !important;
      max-height: 35vh;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
      position: relative;
      transition: all 0.3s ease, max-height 0.3s ease, opacity 0.3s ease, padding 0.3s ease;
    `,
    );

    // Create a sticky header for controls instead of positioning them absolutely
    const controlsHeader = document.createElement("div");
    controlsHeader.id = "voice-controls-header";
    controlsHeader.setAttribute(
      "style",
      `
      position: sticky !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: 28px !important;
      background: white !important;
      z-index: 20 !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      padding: 5px 10px !important;
      border-bottom: 1px solid #f0f0f0 !important;
      border-radius: 12px 12px 0 0 !important;
      margin: 0 !important;
      margin-bottom: 15px !important;
    `,
    );

    // Create clear button for the header
    const clearButton = document.createElement("button");
    clearButton.id = "clear-voice-chat";
    clearButton.setAttribute("onclick", "VoiceroVoice.clearChatHistory()");
    clearButton.style.cssText = `
      background: none;
      border: none;
      cursor: pointer;
      padding: 5px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      background-color: #f0f0f0;
      font-size: 12px;
      color: #666;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    `;
    clearButton.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" style="margin-right: 4px;">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
      <span>Clear</span>
    `;
    controlsHeader.appendChild(clearButton);

    // Create minimize button for the header
    const minimizeButton = document.createElement("button");
    minimizeButton.id = "minimize-voice-chat";
    minimizeButton.setAttribute("onclick", "VoiceroVoice.minimizeVoiceChat()");
    minimizeButton.style.cssText = `
      background: none;
      border: none;
      cursor: pointer;
      padding: 5px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    `;
    minimizeButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round">
        <path d="M8 3h8m-8 18h8M4 8v8m16-8v8"/>
      </svg>
    `;
    controlsHeader.appendChild(minimizeButton);

    // Create close button for the header
    const closeButton = document.createElement("button");
    closeButton.id = "close-voice-chat";
    closeButton.setAttribute("onclick", "VoiceroVoice.closeVoiceChat()");
    closeButton.style.cssText = `
      background: none;
      border: none;
      cursor: pointer;
      padding: 5px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    `;
    closeButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    `;
    controlsHeader.appendChild(closeButton);

    // Create a container for right-aligned buttons
    const rightButtonsContainer = document.createElement("div");
    rightButtonsContainer.style.cssText = `
      display: flex !important;
      gap: 5px !important;
      align-items: center !important;
      margin: 0 !important;
      padding: 0 !important;
      height: 28px !important;
    `;

    // Add loading bar
    const loadingBar = document.createElement("div");
    loadingBar.id = "voice-loading-bar";
    loadingBar.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      height: 3px;
      width: 0%;
      background: linear-gradient(90deg, #882be6, #ff4444, #882be6);
      background-size: 200% 100%;
      border-radius: 3px;
      display: none;
      animation: gradientMove 2s linear infinite;
    `;

    // Move the minimize and close buttons to the right container
    rightButtonsContainer.appendChild(minimizeButton);
    rightButtonsContainer.appendChild(closeButton);
    controlsHeader.appendChild(rightButtonsContainer);

    // Add loading bar directly to the messages container
    messagesContainer.appendChild(loadingBar);

    // Insert the controls header at the top of the messages container
    messagesContainer.insertBefore(
      controlsHeader,
      messagesContainer.firstChild,
    );

    // Create user message div
    const userMessageDiv = document.createElement("div");
    userMessageDiv.className = "user-message";
    userMessageDiv.style.cssText = `
      margin-bottom: 15px;
      animation: fadeIn 0.3s ease forwards;
    `;
    messagesContainer.appendChild(userMessageDiv);

    // Create input container with border - for the mic button
    const inputContainer = document.createElement("div");
    inputContainer.id = "voice-input-wrapper";
    inputContainer.style.cssText = `
      position: relative;
      padding: 2px;
      background: linear-gradient(90deg, #882be6, #ff4444, #882be6);
      background-size: 200% 100%;
      border-radius: 0 0 12px 12px;
      animation: gradientBorder 3s linear infinite;
      transition: all 0.3s ease;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    `;

    // Add maximize button and microphone button
    inputContainer.innerHTML = `
      <button
        id="maximize-voice-chat"
        onclick="VoiceroVoice.maximizeVoiceChat()"
        style="
          position: absolute;
          top: -30px;
          right: 10px;
          background: white;
          border: none;
          cursor: pointer;
          padding: 5px;
          border-radius: 50%;
          display: none;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          z-index: 1001;
          width: 32px;
          height: 32px;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        "
      >
        <svg
          id="voice-mic-icon"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <path d="M12 19v4"/>
          <path d="M8 23h8"/>
        </svg>
      </button>
      <div
        style="
          display: flex;
          align-items: center;
          justify-content: center;
          background: white;
          border-radius: 0 0 12px 12px;
          padding: 10px;
          height: 60px;
        "
      >
        <button
          id="voice-mic-button"
          onclick="VoiceroVoice.toggleMic()"
          style="
            width: 45px;
            height: 45px;
            border-radius: 50%;
            background: #882be6;
            border: 2px solid transparent;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
          "
        >
          <svg
            id="voice-mic-icon"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <path d="M12 19v4"/>
            <path d="M8 23h8"/>
          </svg>
        </button>
      </div>
    `;

    // Assemble interface
    console.log("Assembling voice interface elements:");
    if (!messagesContainer) {
      console.error("CRITICAL: messagesContainer is null before assembly");
      return;
    }

    // Check if user and AI message divs exist
    const userMessageExists =
      messagesContainer.querySelector(".user-message") !== null;
    const aiMessageExists =
      messagesContainer.querySelector(".ai-message") !== null;
    console.log(
      `Initial message divs exist - User: ${userMessageExists}, AI: ${aiMessageExists}`,
    );

    // Add interface elements to the DOM in proper order
    interfaceContainer.appendChild(messagesContainer);
    interfaceContainer.appendChild(inputContainer);

    // Verify before adding to body
    console.log(
      `Interface ready - Messages container ID: ${messagesContainer.id}`,
    );
    console.log(
      `Messages container has ${messagesContainer.children.length} children`,
    );

    // Add to document body
    document.body.appendChild(interfaceContainer);

    // Verify after adding to DOM
    const verifyMessagesContainer = document.getElementById("voice-messages");
    const verifyUserMessage = document.querySelector(".user-message");
    const verifyAiMessage = document.querySelector(".ai-message");
    console.log(
      `After DOM insertion - Messages container: ${
        verifyMessagesContainer ? "exists" : "missing"
      }`,
    );
    console.log(
      `After DOM insertion - User message: ${
        verifyUserMessage ? "exists" : "missing"
      }, AI message: ${verifyAiMessage ? "exists" : "missing"}`,
    );

    // After creating all elements, set the padding again to override any potential changes
    setTimeout(() => {
      const messagesEl = document.getElementById("voice-messages");
      if (messagesEl) {
        messagesEl.style.paddingTop = "0 !important";
        messagesEl.style.padding = "15px";
        messagesEl.style.paddingTop = "0";
      }
    }, 100);

    console.log("Voice chat interface HTML created successfully");
  },

  // Open voice chat interface
  openVoiceChat: function (isRestoring = false) {
    console.log("Opening voice chat interface");

    // First, make sure the interface exists
    this.createVoiceChatInterface();
    const voiceChat = document.getElementById("voice-chat-interface");
    if (!voiceChat) {
      console.error(
        "CRITICAL: Failed to find voice-chat-interface after creation attempt",
      );
      return;
    }

    // Verify that messages container exists
    const messagesContainer = document.getElementById("voice-messages");
    if (!messagesContainer) {
      console.error(
        "CRITICAL: voice-messages container not found after interface creation",
      );
      // Try one more recreation
      voiceChat.remove();
      this.createVoiceChatInterface();
      if (!document.getElementById("voice-messages")) {
        console.error("FATAL: Cannot create voice interface properly");
        return;
      }
    }

    // Hide the core buttons container
    const coreButtonsContainer = document.getElementById(
      "voice-toggle-container",
    );
    if (coreButtonsContainer) {
      coreButtonsContainer.style.display = "none";
    }

    // Check if we're restoring from a minimized state
    if (isRestoring && VoiceroCore && VoiceroCore.appState.isVoiceMinimized) {
      // If minimized, just show the interface but keep messages area hidden
      messagesContainer.style.maxHeight = "0";
      messagesContainer.style.opacity = "0";
      messagesContainer.style.padding = "0";
      messagesContainer.style.overflow = "hidden";
      voiceChat.style.borderRadius = "12px";

      // Show reopen button
      let reopenButton = document.getElementById("reopen-voice-chat");
      if (!reopenButton) {
        reopenButton = document.createElement("button");
        reopenButton.id = "reopen-voice-chat";
        reopenButton.setAttribute("onclick", "VoiceroVoice.reopenVoiceChat()");
        reopenButton.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        `;
        reopenButton.style.cssText = `
          position: absolute;
          top: -30px;
          right: 10px;
          background: white;
          border: none;
          cursor: pointer;
          padding: 5px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          z-index: 1001;
          width: 32px;
          height: 32px;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        `;
        const inputContainer = document.getElementById("voice-input-wrapper");
        if (inputContainer) {
          inputContainer.appendChild(reopenButton);
        }
      } else {
        reopenButton.style.display = "flex";
      }
    } else {
      // Ensure messages area is fully visible when not minimized
      messagesContainer.style.maxHeight = "50vh";
      messagesContainer.style.opacity = "1";
      messagesContainer.style.padding = "15px";
      messagesContainer.style.paddingTop = "35px";
      messagesContainer.style.overflow = "auto";
      voiceChat.style.borderRadius = "12px 12px 0 0";

      // Hide reopen button if it exists
      const reopenButton = document.getElementById("reopen-voice-chat");
      if (reopenButton) {
        reopenButton.style.display = "none";
      }
    }

    // Add control buttons to the voice interface
    if (VoiceroCore) {
      VoiceroCore.addControlButtons(voiceChat, "voice");
    }

    // Hide the maximize button if it exists (legacy)
    const maximizeVoiceButton = document.getElementById("maximize-voice-chat");
    if (maximizeVoiceButton) {
      maximizeVoiceButton.style.display = "none";
      maximizeVoiceButton.style.opacity = "0";
    }

    // Show chat interface with animation
    voiceChat.style.display = "block";
    voiceChat.style.opacity = "0";
    voiceChat.style.transform = "translate(-50%, 20px)";
    setTimeout(() => {
      voiceChat.style.opacity = "1";
      voiceChat.style.transform = "translate(-50%, 0)";

      // Show welcome message AFTER the interface is visible
      if (
        VoiceroCore &&
        !isRestoring &&
        !VoiceroCore.appState.hasShownVoiceWelcome
      ) {
        // Use a small delay to ensure DOM is ready
        setTimeout(() => {
          this.addMessage(
            "Hi there I'm here to help you navigate the online store. When you're ready click the microphone icon to start speaking.",
            "ai",
          );
          VoiceroCore.appState.hasShownVoiceWelcome = true;
          VoiceroCore.saveState();

          // Don't try to speak the welcome message automatically - browsers block autoplay
          // Instead we just show the text message
          console.log(
            "Showing welcome text message only (skipping audio to avoid autoplay restrictions)",
          );
          // The user can click the microphone to start interacting
        }, 100);
      }
    }, 50);

    // Hide the chooser
    const chooser = document.getElementById("interaction-chooser");
    if (chooser) {
      chooser.style.visibility = "hidden";
      chooser.style.opacity = "0";
    }

    // Set active interface
    if (VoiceroCore) {
      VoiceroCore.appState.isOpen = true;
      VoiceroCore.appState.activeInterface = "voice";
      VoiceroCore.appState.isVoiceMinimized = false;
      // Initialize the conversation state flag if it doesn't exist
      if (typeof VoiceroCore.appState.hasHadFirstConversation === "undefined") {
        VoiceroCore.appState.hasHadFirstConversation = false;
        console.log("Initialized hasHadFirstConversation to false");
      }
      VoiceroCore.saveState();
    }
  },

  // Minimize voice chat interface
  minimizeVoiceChat: function () {
    console.log("Minimizing voice chat interface");

    // Get the messages container and input wrapper
    const messagesContainer = document.getElementById("voice-messages");
    const inputContainer = document.getElementById("voice-input-wrapper");
    const voiceChat = document.getElementById("voice-chat-interface");

    if (!messagesContainer || !inputContainer) {
      console.error("Could not find message or input containers to minimize");
      return;
    }

    // Hide only the messages container with animation
    messagesContainer.style.maxHeight = "0";
    messagesContainer.style.opacity = "0";
    messagesContainer.style.padding = "0";
    messagesContainer.style.overflow = "hidden";

    // Update the interface container to only contain the input area
    voiceChat.style.borderRadius = "12px";

    // Add a reopen button to the input container
    let reopenButton = document.getElementById("reopen-voice-chat");
    if (!reopenButton) {
      reopenButton = document.createElement("button");
      reopenButton.id = "reopen-voice-chat";
      reopenButton.setAttribute("onclick", "VoiceroVoice.reopenVoiceChat()");
      reopenButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round">
          <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
      `;
      reopenButton.style.cssText = `
        position: absolute;
        top: -30px;
        right: 10px;
        background: white;
        border: none;
        cursor: pointer;
        padding: 5px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        z-index: 1001;
        width: 32px;
        height: 32px;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
      `;
      inputContainer.appendChild(reopenButton);
    } else {
      reopenButton.style.display = "flex";
    }

    if (VoiceroCore) {
      VoiceroCore.appState.isVoiceMinimized = true;
      VoiceroCore.saveState();
    }
  },

  // Maximize voice chat interface
  maximizeVoiceChat: function () {
    console.log("maximizeVoiceChat called, redirecting to reopenVoiceChat");
    this.reopenVoiceChat();
  },

  // Close voice chat and reopen chooser interface
  closeVoiceChat: function () {
    console.log("Closing voice chat and reopening chooser interface");

    // Set flag to prevent auto microphone activation on shutdown
    this.isShuttingDown = true;

    // Stop any ongoing recording
    if (this.isRecording) {
      // CHANGED: pass "manual" here just to clarify user action:
      this.toggleMic("manual");
    }

    // Stop any audio streams that might be active
    if (this.currentAudioStream) {
      this.currentAudioStream.getTracks().forEach((track) => track.stop());
      this.currentAudioStream = null;
    }

    // Reset the shutdown flag after a moment
    setTimeout(() => {
      this.isShuttingDown = false;
    }, 500);

    // Get voice chat element
    const voiceChat = document.getElementById("voice-chat-interface");
    if (voiceChat) {
      voiceChat.style.display = "none";

      // Reset any minimized state styling
      const messagesContainer = document.getElementById("voice-messages");
      if (messagesContainer) {
        messagesContainer.style.maxHeight = "50vh";
        messagesContainer.style.opacity = "1";
        messagesContainer.style.padding = "15px";
        messagesContainer.style.paddingTop = "35px";
        messagesContainer.style.overflow = "auto";
      }
      voiceChat.style.borderRadius = "12px 12px 0 0";

      // Hide reopen button if exists
      const reopenButton = document.getElementById("reopen-voice-chat");
      if (reopenButton) {
        reopenButton.style.display = "none";
      }
    }

    // Hide the maximize button if it exists (legacy)
    const maximizeVoiceButton = document.getElementById("maximize-voice-chat");
    if (maximizeVoiceButton) {
      maximizeVoiceButton.style.display = "none";
      maximizeVoiceButton.style.opacity = "0";
    }

    // Update app state
    if (VoiceroCore) {
      VoiceroCore.appState.isOpen = false;
      VoiceroCore.appState.activeInterface = null;
      VoiceroCore.appState.isVoiceMinimized = false; // Reset minimized state
      VoiceroCore.saveState();

      // Show the container that holds the buttons
      const coreButtonsContainer = document.getElementById(
        "voice-toggle-container",
      );
      if (coreButtonsContainer) {
        console.log("Making voice-toggle-container visible");
        coreButtonsContainer.style.display = "block";
      }

      // Reopen the chooser interface
      console.log("Reopening chooser interface");
      if (VoiceroCore.showChooser) {
        VoiceroCore.showChooser();
      } else {
        // Fallback to direct manipulation if the method isn't available
        const chooser = document.getElementById("interaction-chooser");
        if (chooser) {
          chooser.style.display = "flex";
          chooser.style.visibility = "visible";
          chooser.style.opacity = "1";
        } else if (VoiceroCore.init) {
          VoiceroCore.init();
        }
      }
    }
  },

  /**
   * Toggle microphone recording
   * @param {string} source - "manual" if user clicked the mic button, "auto" if triggered programmatically (silence/timeout).
   */
  // CHANGED: added a `source = "manual"` parameter
  toggleMic: function (source = "manual") {
    console.log(
      "Toggle mic called, current recording state:",
      this.isRecording,
      "| source:",
      source,
    );
    const micButton = document.getElementById("voice-mic-button");
    const micIcon = document.getElementById("voice-mic-icon");

    // If the voice chat is minimized and we're about to start recording, reopen it
    if (
      !this.isRecording &&
      VoiceroCore &&
      VoiceroCore.appState &&
      VoiceroCore.appState.isVoiceMinimized
    ) {
      console.log("Voice chat is minimized, reopening before recording");
      this.reopenVoiceChat();
    }

    if (this.isRecording) {
      // Stop recording
      console.log("Stopping recording without processing audio");

      this.isRecording = false;

      // CHANGED: Only set `manuallyStoppedRecording` if source is "manual"
      if (source === "manual") {
        this.manuallyStoppedRecording = true;
      }

      // Update UI
      micButton.classList.remove("active");
      micButton.style.borderColor = "transparent";
      micIcon.style.stroke = "white";

      // Stop the media recorder if it exists
      if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
        // Cancel/reset any audio chunks instead of processing them
        this.audioChunks = [];
        console.log("Discarding collected audio chunks");

        this.mediaRecorder.stop();
        console.log("MediaRecorder stopped without processing");

        // Clear the recording timeout
        if (this.recordingTimeout) {
          clearTimeout(this.recordingTimeout);
          this.recordingTimeout = null;
        }

        // Clear silence detection
        if (this.silenceDetectionTimer) {
          clearInterval(this.silenceDetectionTimer);
          this.silenceDetectionTimer = null;
        }
      }

      // Clean up audio stream
      if (this.currentAudioStream) {
        this.currentAudioStream.getTracks().forEach((track) => track.stop());
        this.currentAudioStream = null;
      }

      // Clean up audio context
      if (this.audioContext) {
        this.audioContext
          .close()
          .then(() => {
            console.log("Audio context closed");
            this.audioContext = null;
            this.analyser = null;
          })
          .catch((err) => {
            console.error("Error closing audio context:", err);
            this.audioContext = null;
            this.analyser = null;
          });
      }
    } else {
      // Start recording
      console.log("Starting recording");

      // Reset manual stop flag when starting a new recording
      this.manuallyStoppedRecording = false;

      // Update UI first to give immediate feedback
      micButton.classList.add("active");
      micButton.style.borderColor = "#ff4444";
      micIcon.style.stroke = "white";

      // Reset silence detection variables
      this.silenceTime = 0;
      this.isSpeaking = false;
      this.hasStartedSpeaking = false;

      // Check if AudioContext is supported
      const audioContextSupported = this.isAudioContextSupported();
      console.log("AudioContext supported:", audioContextSupported);

      // Request microphone access
      navigator.mediaDevices
        .getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 44100,
            channelCount: 1,
          },
        })
        .then((stream) => {
          console.log("Got media stream:", stream);

          // Log audio track settings to help with debugging
          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length > 0) {
            const settings = audioTracks[0].getSettings();
            console.log("Audio track settings:", settings);
          }

          this.currentAudioStream = stream;

          // Create media recorder with higher bitrate
          this.mediaRecorder = new MediaRecorder(stream, {
            mimeType: "audio/webm;codecs=opus",
            audioBitsPerSecond: 128000,
          });
          this.audioChunks = [];

          // Set up audio analysis for silence detection if supported
          if (audioContextSupported) {
            try {
              this.audioContext = new (window.AudioContext ||
                window.webkitAudioContext)();
              const source = this.audioContext.createMediaStreamSource(stream);
              this.analyser = this.audioContext.createAnalyser();
              this.analyser.fftSize = 256;
              source.connect(this.analyser);

              // Start silence detection
              const bufferLength = this.analyser.frequencyBinCount;
              const dataArray = new Uint8Array(bufferLength);

              this.silenceDetectionTimer = setInterval(() => {
                this.analyser.getByteFrequencyData(dataArray);
                // Calculate average volume
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                  sum += dataArray[i];
                }
                const average = sum / bufferLength;

                // Check if user is speaking
                if (average > this.silenceThreshold) {
                  this.silenceTime = 0;
                  if (!this.isSpeaking) {
                    this.isSpeaking = true;
                    this.hasStartedSpeaking = true;
                    console.log("User started speaking");
                  }
                } else {
                  if (this.isSpeaking) {
                    this.silenceTime += 100; // Interval is 100ms
                    // If silence for more than 1.5 seconds after speaking, stop recording
                    if (this.silenceTime > 2500 && this.hasStartedSpeaking) {
                      console.log(
                        "Silence detected for 2.5s after speaking, stopping recording",
                      );
                      clearInterval(this.silenceDetectionTimer);
                      this.silenceDetectionTimer = null;

                      // CHANGED: pass "auto" to differentiate from user stop
                      this.toggleMic("auto"); // Stop recording
                    }
                  }
                }
              }, 100);
            } catch (error) {
              console.error("Error setting up audio analysis:", error);
            }
          }

          // Handle data available event
          this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              this.audioChunks.push(event.data);
              console.log(`Added audio chunk, size: ${event.data.size} bytes`);
            }
          };

          this.mediaRecorder.onstop = async () => {
            console.log("MediaRecorder stopped, processing audio");

            // Check if recording was manually stopped by the user
            if (this.manuallyStoppedRecording) {
              console.log(
                "Recording was manually stopped by user, skipping audio processing",
              );
              // Clear flag for next recording
              this.manuallyStoppedRecording = false;

              // Clean up
              if (this.currentAudioStream) {
                this.currentAudioStream
                  .getTracks()
                  .forEach((track) => track.stop());
                this.currentAudioStream = null;
              }
              // Clear audio chunks
              this.audioChunks = [];
              return; // Exit without processing audio
            }

            console.log(`Total audio chunks: ${this.audioChunks.length}`);
            // Create audio blob from chunks
            const audioBlob = new Blob(this.audioChunks, {
              type: "audio/webm",
            });
            console.log("Audio blob created, size:", audioBlob.size);

            // Only process if we have actual audio data
            if (audioBlob.size > 0) {
              try {
                // Send to Whisper API for transcription
                const formData = new FormData();
                formData.append("audio", audioBlob, "recording.webm");
                formData.append("url", window.location.href);
                formData.append(
                  "threadId",
                  VoiceroCore ? VoiceroCore.currentThreadId || "" : "",
                );

                const whisperResponse = await fetch(
                  "http://localhost:3000/api/whisper",
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${window.voiceroConfig.accessKey}`,
                    },
                    body: formData,
                  },
                );
                if (!whisperResponse.ok)
                  throw new Error("Whisper API request failed");
                const whisperData = await whisperResponse.json();
                console.log("Whisper API response:", whisperData);

                // Extract the transcription
                const transcription =
                  whisperData.transcription ||
                  whisperData.text ||
                  "Could not transcribe audio";

                // Update the user message with transcription
                this.addMessage(transcription, "user");

                // Mark that first conversation has occurred
                if (VoiceroCore && VoiceroCore.appState) {
                  VoiceroCore.appState.hasHadFirstConversation = true;
                  VoiceroCore.saveState();
                  console.log("Marked first conversation as occurred");
                }

                // Show typing indicator instead of text placeholder
                this.addTypingIndicator();

                // Now send the transcription to the Shopify chat endpoint
                const chatResponse = await fetch(
                  "http://localhost:3000/api/shopify/chat",
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${window.voiceroConfig.accessKey}`,
                    },
                    body: JSON.stringify({
                      message: transcription,
                      url: window.location.href,
                      type: "voice",
                      source: "voicero",
                      threadId: VoiceroCore
                        ? VoiceroCore.currentThreadId || null
                        : null,
                      chatHistory: [], // Could be populated if we wanted to send previous messages
                    }),
                  },
                );
                if (!chatResponse.ok)
                  throw new Error("Chat API request failed");

                const chatData = await chatResponse.json();
                console.log("Chat API response:", chatData);

                // Store thread ID from response
                if (chatData.threadId && VoiceroCore) {
                  VoiceroCore.currentThreadId = chatData.threadId;
                }

                // Store in state
                if (VoiceroCore && VoiceroCore.appState) {
                  // Initialize voiceMessages if it doesn't exist
                  if (!VoiceroCore.appState.voiceMessages) {
                    VoiceroCore.appState.voiceMessages = {};
                  }
                  VoiceroCore.appState.voiceMessages.user = transcription;
                  VoiceroCore.saveState();
                }

                // Get the text response
                const aiTextResponse =
                  chatData.response || "Sorry, I don't have a response.";

                // Process text to extract and clean URLs
                const processedResponse =
                  this.extractAndCleanUrls(aiTextResponse);
                const cleanedTextResponse = processedResponse.text;
                const extractedUrls = processedResponse.urls;

                try {
                  // Request audio generation using TTS endpoint
                  const ttsResponse = await fetch(
                    "http://localhost:3000/api/tts",
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${window.voiceroConfig.accessKey}`,
                      },
                      body: JSON.stringify({
                        text: cleanedTextResponse, // Send cleaned text to TTS
                      }),
                    },
                  );
                  if (!ttsResponse.ok)
                    throw new Error("TTS API request failed");

                  // Convert response to audio blob
                  const audioData = await ttsResponse.arrayBuffer();
                  const audioBlob = new Blob([audioData], {
                    type: "audio/mpeg",
                  });

                  // Remove typing indicator before adding the real response
                  this.removeTypingIndicator();

                  // Update AI message with cleaned text content
                  this.addMessage(cleanedTextResponse, "ai");

                  // Store in state
                  if (VoiceroCore && VoiceroCore.appState) {
                    // Initialize voiceMessages if it doesn't exist
                    if (!VoiceroCore.appState.voiceMessages) {
                      VoiceroCore.appState.voiceMessages = {};
                    }
                    VoiceroCore.appState.voiceMessages.ai = cleanedTextResponse;
                    VoiceroCore.saveState();
                  }

                  // Play the audio response AFTER displaying the text
                  await this.playAudioResponse(audioBlob);

                  // After audio playback completes, redirect to the first URL if one exists
                  if (extractedUrls.length > 0) {
                    this.redirectToUrl(extractedUrls[0]);
                  }
                } catch (audioError) {
                  console.error("Error processing audio response:", audioError);

                  // Remove typing indicator before adding the error message
                  this.removeTypingIndicator();
                  // Just show the text response if audio fails
                  this.addMessage(cleanedTextResponse, "ai");

                  // Store in state
                  if (VoiceroCore && VoiceroCore.appState) {
                    if (!VoiceroCore.appState.voiceMessages) {
                      VoiceroCore.appState.voiceMessages = {};
                    }
                    VoiceroCore.appState.voiceMessages.ai = cleanedTextResponse;
                    VoiceroCore.saveState();
                  }

                  // Redirect to the first URL if one exists, even if audio failed
                  if (extractedUrls.length > 0) {
                    this.redirectToUrl(extractedUrls[0]);
                  }
                }
              } catch (error) {
                console.error("Error processing audio:", error);

                // Remove any placeholder messages
                const messagesContainer =
                  document.getElementById("voice-messages");
                if (messagesContainer) {
                  const placeholders = messagesContainer.querySelectorAll(
                    ".ai-message.placeholder",
                  );
                  placeholders.forEach((el) => el.remove());
                }

                // Update AI message with error
                const aiMessageDiv = document.querySelector(
                  "#voice-chat-interface .ai-message",
                );
                if (aiMessageDiv) {
                  aiMessageDiv.textContent =
                    "Sorry, I encountered an error processing your audio.";
                }
              }
            } else {
              console.log("No audio data recorded");
            }

            // Clean up
            if (this.currentAudioStream) {
              this.currentAudioStream
                .getTracks()
                .forEach((track) => track.stop());
              this.currentAudioStream = null;
            }

            // Clean up audio context
            if (this.audioContext) {
              this.audioContext
                .close()
                .then(() => {
                  console.log("Audio context closed");
                  this.audioContext = null;
                  this.analyser = null;
                })
                .catch((err) => {
                  console.error("Error closing audio context:", err);
                  this.audioContext = null;
                  this.analyser = null;
                });
            }
          };

          // Start recording
          this.mediaRecorder.start();
          this.isRecording = true;
          console.log(
            "MediaRecorder started - Waiting for user to speak (no initial silence timeout)",
          );

          // Set a timeout to automatically stop recording after 30 seconds
          this.recordingTimeout = setTimeout(() => {
            if (
              this.isRecording &&
              this.mediaRecorder &&
              this.mediaRecorder.state !== "inactive"
            ) {
              console.log("Recording timeout reached, stopping automatically");
              // CHANGED: pass "auto" to differentiate from user stop
              this.toggleMic("auto"); // Call toggleMic again to stop recording
            }
          }, 30000); // Increased from 15000 to 30000 (30 seconds)
        })
        .catch((error) => {
          console.error("Error accessing microphone:", error);
          // Reset UI
          micButton.classList.remove("active");
          micButton.style.borderColor = "transparent";
          micIcon.style.stroke = "white";
          this.isRecording = false;

          // Show error message in the voice interface
          const aiMessageDiv = document.querySelector(
            "#voice-chat-interface .ai-message",
          );
          if (aiMessageDiv) {
            aiMessageDiv.textContent =
              "Please allow microphone access to use voice chat.";
          }
        });
    }
  },

  // Play audio response
  playAudioResponse: async function (audioBlob) {
    console.log("Playing audio response, blob size:", audioBlob.size);
    return new Promise((resolve, reject) => {
      try {
        // Create audio element
        const audio = new Audio();
        const audioUrl = URL.createObjectURL(audioBlob);
        audio.src = audioUrl;

        // Set up event listeners
        audio.onended = () => {
          console.log("Audio playback ended");
          URL.revokeObjectURL(audioUrl);

          // Check if this is the welcome message or a regular response
          const isWelcomeMessage =
            !VoiceroCore.appState.hasHadFirstConversation;

          // Turn the microphone back on automatically only after the first conversation
          if (!this.isShuttingDown && !isWelcomeMessage) {
            setTimeout(() => {
              console.log("Auto-activating microphone after AI response");
              // CHANGED: pass "auto"
              this.toggleMic("auto");
            }, 300); // Small delay for better UX
          } else if (isWelcomeMessage) {
            console.log("Skipping auto-mic activation for welcome message");
            // Mark that the welcome message has been played
            if (VoiceroCore && VoiceroCore.appState) {
              VoiceroCore.appState.hasHadFirstConversation = false;
              VoiceroCore.saveState();
            }
          }
          resolve();
        };

        audio.onerror = (error) => {
          console.error("Audio playback error:", error);
          URL.revokeObjectURL(audioUrl);
          reject(error);
        };

        // Start playback
        console.log("Starting audio playback");
        audio.play().catch((error) => {
          console.error("Failed to play audio:", error);
          reject(error);
        });
      } catch (error) {
        console.error("Error setting up audio playback:", error);
        reject(error);
      }
    });
  },

  // Extract URLs from text and clean the text
  extractAndCleanUrls: function (text) {
    // Store extracted URLs
    const extractedUrls = [];

    // Format currency for better TTS pronunciation
    text = this.formatCurrencyForSpeech(text);

    // First handle markdown-style links [text](url)
    const markdownRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let markdownMatch;
    let cleanedText = text;

    while ((markdownMatch = markdownRegex.exec(text)) !== null) {
      const linkText = markdownMatch[1];
      let url = markdownMatch[2];

      // Remove trailing punctuation that might have been included
      url = url.replace(/[.,;:!?)]+$/, "");

      // Add the URL to our collection
      if (url && url.trim() !== "") {
        try {
          // Ensure URL has proper protocol
          const formattedUrl = url.startsWith("http") ? url : `https://${url}`;
          // Test if it's a valid URL before adding
          new URL(formattedUrl);
          extractedUrls.push(formattedUrl);
        } catch (e) {
          console.warn("Invalid URL found in markdown:", url);
        }
      }
      // Replace the markdown link with just the text
      cleanedText = cleanedText.replace(markdownMatch[0], linkText);
    }

    // Now handle regular URLs
    const urlRegex =
      /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([^\s]+\.(com|org|net|io|co|shop|store|app)(\/?[^\s]*)?)/gi;
    let match;

    const textWithoutMarkdown = cleanedText;
    while ((match = urlRegex.exec(textWithoutMarkdown)) !== null) {
      let url = match[0];
      // Remove trailing punctuation that might have been included
      url = url.replace(/[.,;:!?)]+$/, "");
      try {
        const formattedUrl = url.startsWith("http") ? url : `https://${url}`;
        new URL(formattedUrl);
        if (!extractedUrls.includes(formattedUrl)) {
          extractedUrls.push(formattedUrl);
        }
      } catch (e) {
        console.warn("Invalid URL found in regular text:", url);
      }
    }

    // Replace URL patterns with natural language alternatives
    cleanedText = cleanedText.replace(
      /check out (https?:\/\/[^\s]+|www\.[^\s]+|[^\s]+\.(com|org|net|io|co|shop|store|app)(\/?[^\s]*)?)/gi,
      "check it out",
    );
    cleanedText = cleanedText.replace(
      /at (https?:\/\/[^\s]+|www\.[^\s]+|[^\s]+\.(com|org|net|io|co|shop|store|app)(\/?[^\s]*)?)/gi,
      "here",
    );
    cleanedText = cleanedText.replace(
      /here: (https?:\/\/[^\s]+|www\.[^\s]+|[^\s]+\.(com|org|net|io|co|shop|store|app)(\/?[^\s]*)?)/gi,
      "here",
    );
    cleanedText = cleanedText.replace(
      /at this link: (https?:\/\/[^\s]+|www\.[^\s]+|[^\s]+\.(com|org|net|io|co|shop|store|app)(\/?[^\s]*)?)/gi,
      "here",
    );
    cleanedText = cleanedText.replace(
      /visit (https?:\/\/[^\s]+|www\.[^\s]+|[^\s]+\.(com|org|net|io|co|shop|store|app)(\/?[^\s]*)?)/gi,
      "visit this page",
    );

    // Replace any remaining URLs with "this link"
    cleanedText = cleanedText.replace(urlRegex, "this link");

    // Remove any double spaces that might have been created
    cleanedText = cleanedText.replace(/\s\s+/g, " ").trim();

    return {
      text: cleanedText,
      urls: extractedUrls,
    };
  },

  // Handle redirection to extracted URLs
  redirectToUrl: function (url) {
    if (!url) return;
    try {
      new URL(url);
      console.log("Redirecting to URL:", url);

      // Before redirecting, save state that we were in voice chat mode
      if (VoiceroCore) {
        // Save that we should reactivate voice on next page load
        localStorage.setItem("voicero_reactivate_voice", "true");
        localStorage.setItem("voicero_auto_mic", "true");
        console.log("Set voicero_auto_mic to true in localStorage");

        if (VoiceroCore.appState) {
          VoiceroCore.appState.isOpen = true;
          VoiceroCore.appState.activeInterface = "voice";
          VoiceroCore.appState.isVoiceMinimized = false;
          VoiceroCore.saveState();
        }
        console.log("Saved voice chat state before redirect");
      }

      // Navigate in the same tab instead of opening a new one
      window.location.href = url;
    } catch (error) {
      console.error("Invalid URL, cannot redirect:", url, error);
      const aiMessageDiv = document.querySelector(
        "#voice-chat-interface .ai-message",
      );
      if (aiMessageDiv && aiMessageDiv.querySelector(".message-content")) {
        const messageContent = aiMessageDiv.querySelector(".message-content");
        const notificationElement = document.createElement("div");
        notificationElement.style.cssText = `
          margin-top: 10px;
          padding: 8px 12px;
          background: #fff0f0;
          border-radius: 8px;
          font-size: 14px;
          color: #d43b3b;
          text-align: center;
        `;
        notificationElement.textContent =
          "I couldn't open the link mentioned. There might be an issue with the URL.";
        messageContent.appendChild(notificationElement);

        const messagesContainer = document.getElementById("voice-messages");
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }
    }
  },

  // Check if AudioContext is supported
  isAudioContextSupported: function () {
    return !!(window.AudioContext || window.webkitAudioContext);
  },

  // Add typing indicator
  addTypingIndicator: function () {
    const messagesContainer = document.getElementById("voice-messages");
    if (!messagesContainer) {
      console.error("Messages container not found");
      return;
    }
    this.removeTypingIndicator();

    const indicator = document.createElement("div");
    indicator.className = "typing-indicator";
    indicator.id = "voice-typing-indicator";
    indicator.style.cssText = `
      display: flex;
      gap: 4px;
      padding: 8px 12px;
      background: #f0f0f0;
      border-radius: 12px 12px 12px 0;
      margin-bottom: 15px;
      width: fit-content;
      align-items: center;
      animation: fadeIn 0.3s ease forwards;
    `;

    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("div");
      dot.style.cssText = `
        width: 8px;
        height: 8px;
        background: #882be6;
        border-radius: 50%;
        animation: bounce 1.5s infinite;
        animation-delay: ${i * 0.2}s;
      `;
      indicator.appendChild(dot);
    }

    const animStyle = document.createElement("style");
    animStyle.innerHTML = `
      @keyframes bounce {
        0%, 60%, 100% {
          transform: translateY(0);
        }
        30% {
          transform: translateY(-4px);
        }
      }
    `;
    document.head.appendChild(animStyle);

    messagesContainer.appendChild(indicator);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return indicator;
  },

  // Remove typing indicator
  removeTypingIndicator: function () {
    const indicator = document.getElementById("voice-typing-indicator");
    if (indicator) {
      indicator.parentNode.removeChild(indicator);
    }
  },

  // Add message to the voice chat
  addMessage: function (content, role, formatMarkdown = false) {
    console.log(`Adding ${role} message to voice chat`);

    let messagesContainer = document.getElementById("voice-messages");
    if (!messagesContainer) {
      console.log(
        "Voice messages container not found, ensuring interface exists",
      );
      this.createVoiceChatInterface();
      messagesContainer = document.getElementById("voice-messages");
      if (!messagesContainer) {
        console.error(
          "Voice messages container still not found after creating interface",
        );
        const interfaceExists =
          document.getElementById("voice-chat-interface") !== null;
        console.error(`Interface container exists: ${interfaceExists}`);
        if (interfaceExists) {
          const interfaceElement = document.getElementById(
            "voice-chat-interface",
          );
          interfaceElement.remove();
          this.createVoiceChatInterface();
          messagesContainer = document.getElementById("voice-messages");
          if (!messagesContainer) {
            console.error(
              "CRITICAL: Still cannot create messages container after forced recreation",
            );
            return;
          }
        } else {
          return;
        }
      }
    }

    if (
      content === "Generating response..." ||
      content.includes("Thinking...") ||
      content === "..."
    ) {
      const existingPlaceholders = messagesContainer.querySelectorAll(
        ".ai-message.placeholder",
      );
      existingPlaceholders.forEach((el) => el.remove());
    }

    if (
      role === "ai" &&
      content !== "Generating response..." &&
      !content.includes("Thinking...") &&
      content !== "..."
    ) {
      const existingPlaceholders = messagesContainer.querySelectorAll(
        ".ai-message.placeholder",
      );
      existingPlaceholders.forEach((el) => el.remove());
    }

    console.log(`Creating new ${role} message element`);
    const messageEl = document.createElement("div");
    messageEl.className = role === "user" ? "user-message" : "ai-message";

    if (
      content === "Generating response..." ||
      content.includes("Thinking...") ||
      content === "..."
    ) {
      messageEl.className += " placeholder";
    }

    messageEl.style.cssText = `
      margin-bottom: 15px;
      animation: fadeIn 0.3s ease forwards;
      display: flex;
      justify-content: ${role === "user" ? "flex-end" : "flex-start"};
      width: 100%;
    `;

    let messageContent = document.createElement("div");
    messageContent.className = "message-content";

    if (formatMarkdown && role === "ai" && VoiceroCore) {
      messageContent.innerHTML = VoiceroCore.formatMarkdown(content);
    } else {
      messageContent.textContent = content;
    }

    if (role === "user") {
      messageContent.style.cssText = `
        background: #882be6;
        color: white;
        border-radius: 18px 18px 0 18px;
        padding: 10px 14px;
        max-width: 80%;
        word-wrap: break-word;
        font-size: 14px;
        line-height: 1.4;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
      `;
    } else if (role === "ai") {
      if (
        content === "Generating response..." ||
        content.includes("Thinking...") ||
        content === "..."
      ) {
        messageContent.style.cssText = `
          background: #f9f9f9;
          color: #666;
          border-radius: 18px 18px 18px 0;
          padding: 10px 14px;
          max-width: 80%;
          word-wrap: break-word;
          font-size: 14px;
          line-height: 1.4;
          font-style: italic;
          border: 1px dashed #ddd;
        `;
      } else {
        messageContent.style.cssText = `
          background: #f0f0f0;
          color: #333;
          border-radius: 18px 18px 18px 0;
          padding: 10px 14px;
          max-width: 80%;
          word-wrap: break-word;
          font-size: 14px;
          line-height: 1.4;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
        `;
      }
    }

    messageEl.appendChild(messageContent);
    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return messageEl;
  },

  // Format currency values for better speech pronunciation
  formatCurrencyForSpeech: function (text) {
    return text.replace(/\$(\d+)\.(\d{2})/g, function (match, dollars, cents) {
      if (cents === "00") {
        return `${dollars} dollars`;
      } else if (dollars === "1") {
        return `1 dollar and ${cents} cents`;
      } else {
        return `${dollars} dollars and ${cents} cents`;
      }
    });
  },

  // Reopen the voice chat from minimized state
  reopenVoiceChat: function () {
    console.log("Reopening minimized voice chat interface");

    const messagesContainer = document.getElementById("voice-messages");
    const voiceChat = document.getElementById("voice-chat-interface");
    const reopenButton = document.getElementById("reopen-voice-chat");

    if (!messagesContainer) {
      console.error("Messages container not found when trying to reopen");
      return;
    }

    messagesContainer.style.maxHeight = "50vh";
    messagesContainer.style.opacity = "1";
    messagesContainer.style.padding = "15px";
    messagesContainer.style.paddingTop = "35px";
    messagesContainer.style.overflow = "auto";

    voiceChat.style.borderRadius = "12px 12px 0 0";

    if (reopenButton) {
      reopenButton.style.display = "none";
    }

    if (VoiceroCore) {
      VoiceroCore.appState.isVoiceMinimized = false;
      VoiceroCore.saveState();
    }
  },

  // Speak welcome message using TTS
  speakWelcomeMessage: async function (welcomeText) {
    console.log(
      "Speaking welcome message via TTS - Skipping audio playback due to browser autoplay restrictions",
    );
    // We're not going to attempt to play audio automatically since browsers will block it
    // The user will need to interact with the page first (like clicking the mic button)
    // Display the welcome message as text only
    if (welcomeText) {
      this.addMessage(welcomeText, "ai");
    }
    return;
  },

  // Clear chat history
  clearChatHistory: function () {
    console.log("Clearing voice chat history");
    const messagesContainer = document.getElementById("voice-messages");
    if (messagesContainer) {
      const existingMessages = messagesContainer.querySelectorAll(
        ".user-message, .ai-message",
      );
      existingMessages.forEach((el) => el.remove());
    }
    if (VoiceroCore && VoiceroCore.appState) {
      VoiceroCore.appState.voiceMessages = {};
      VoiceroCore.saveState();
    }
  },
};

// Initialize when core is ready
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM content loaded, initializing VoiceroVoice...");
  const existingInterface = document.getElementById("voice-chat-interface");
  if (existingInterface) {
    console.log("Interface already exists on DOMContentLoaded, cleaning up");
    existingInterface.remove();
  }

  if (typeof VoiceroCore !== "undefined") {
    console.log("VoiceroCore found, initializing Voice module");
    VoiceroVoice.init();

    // Check for voice reactivation after navigation
    const shouldReactivate =
      localStorage.getItem("voicero_reactivate_voice") === "true" ||
      (VoiceroCore.appState &&
        VoiceroCore.appState.isOpen &&
        VoiceroCore.appState.activeInterface === "voice");

    if (shouldReactivate) {
      console.log(
        "Reactivating voice chat after navigation - State indicates interface should be open",
      );
      localStorage.removeItem("voicero_reactivate_voice");

      // Wait a moment for everything to initialize properly
      setTimeout(() => {
        // Force update VoiceroCore state to ensure UI matches state
        if (VoiceroCore && VoiceroCore.appState) {
          VoiceroCore.appState.isOpen = true;
          VoiceroCore.appState.activeInterface = "voice";
          VoiceroCore.appState.isVoiceMinimized = false;
          VoiceroCore.saveState();
        }
        // Open voice chat interface
        VoiceroVoice.openVoiceChat();

        // Also start the microphone automatically if needed
        const shouldActivateMic =
          localStorage.getItem("voicero_auto_mic") === "true";
        console.log("Should auto-activate microphone:", shouldActivateMic);
        if (shouldActivateMic) {
          console.log("Auto-activating microphone after redirect");
          localStorage.removeItem("voicero_auto_mic");
          setTimeout(() => VoiceroVoice.toggleMic("auto"), 800);
        }
      }, 1000);
    }
  } else {
    console.log("VoiceroCore not found, waiting for it to load");
    let attempts = 0;
    const checkCoreInterval = setInterval(() => {
      attempts++;
      if (typeof VoiceroCore !== "undefined") {
        clearInterval(checkCoreInterval);
        console.log(
          `VoiceroCore found after ${attempts} attempts, initializing Voice module`,
        );
        VoiceroVoice.init();

        // Check for voice reactivation after VoiceroCore loads
        const shouldReactivate =
          localStorage.getItem("voicero_reactivate_voice") === "true" ||
          (VoiceroCore.appState &&
            VoiceroCore.appState.isOpen &&
            VoiceroCore.appState.activeInterface === "voice");
        if (shouldReactivate) {
          console.log("Reactivating voice chat after core loads");
          localStorage.removeItem("voicero_reactivate_voice");
          setTimeout(() => {
            if (VoiceroCore && VoiceroCore.appState) {
              VoiceroCore.appState.isOpen = true;
              VoiceroCore.appState.activeInterface = "voice";
              VoiceroCore.appState.isVoiceMinimized = false;
              VoiceroCore.saveState();
            }
            VoiceroVoice.openVoiceChat();

            const shouldActivateMic =
              localStorage.getItem("voicero_auto_mic") === "true";
            console.log("Should auto-activate microphone:", shouldActivateMic);
            if (shouldActivateMic) {
              console.log("Auto-activating microphone after redirect");
              localStorage.removeItem("voicero_auto_mic");
              setTimeout(() => VoiceroVoice.toggleMic("auto"), 800);
            }
          }, 1000);
        }
      } else if (attempts >= 50) {
        clearInterval(checkCoreInterval);
        console.error(
          "VoiceroCore not available after 50 attempts (5 seconds)",
        );
      }
    }, 100);
  }
});

// Expose global functions
window.VoiceroVoice = VoiceroVoice;

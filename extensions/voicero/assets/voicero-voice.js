/**
 * VoiceroAI Voice Module
 * Handles voice chat functionality
 */

// Voice interface variables
const VoiceroVoice = {
  // IMPORTANT: Division of responsibilities
  // VoiceroVoice should ONLY handle the voice interface itself.
  // It should NOT manipulate:
  // 1. The interaction chooser (#interaction-chooser)
  // 2. The toggle container (#voice-toggle-container)
  // 3. The main chat button (#chat-website-button)
  //
  // These elements are managed EXCLUSIVELY by VoiceroCore.js
  // Any manipulation of these elements should happen only in VoiceroCore.js

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
  websiteColor: "#882be6", // Default color
  isOpeningVoiceChat: false,
  isClosingVoiceChat: false, // New flag to track close operation
  lastOpenTime: 0, // New: Track when the interface was last opened

  // Initialize the voice module
  init: function () {
    if (this.initialized) return;

    console.log("VoiceroVoice: Initializing voice module");

    // Set up message container references
    this.setupContainers();

    // Get website color from Core if available
    if (window.VoiceroCore) {
      // First check color directly from VoiceroCore
      if (window.VoiceroCore.websiteColor) {
        this.websiteColor = window.VoiceroCore.websiteColor;
        console.log(
          "VoiceroVoice: Using website color from VoiceroCore:",
          this.websiteColor,
        );
      }
      // Then also check if there's a color in the session object
      else if (
        window.VoiceroCore.session &&
        window.VoiceroCore.session.website &&
        window.VoiceroCore.session.website.color
      ) {
        this.websiteColor = window.VoiceroCore.session.website.color;
        console.log(
          "VoiceroVoice: Using website color from session:",
          this.websiteColor,
        );
      }
      // Otherwise use default color
      else {
        this.websiteColor = "#882be6";
        console.log("VoiceroVoice: Using default color:", this.websiteColor);
      }
    } else {
      // Use default color
      this.websiteColor = "#882be6";
      console.log(
        "VoiceroVoice: VoiceroCore not available, using default color:",
        this.websiteColor,
      );
    }

    // Set CSS variable for theme color to ensure consistency
    document.documentElement.style.setProperty(
      "--voicero-theme-color",
      this.websiteColor,
    );

    // Set up welcome message observer
    this.setupWelcomeMessageObserver();

    // Wait for DOM to be ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        // Create the voice interface container if it doesn't exist
        this.createVoiceChatInterface();
      });
    } else {
      // If DOM is already loaded, create interface immediately
      this.createVoiceChatInterface();
    }

    // Mark as initialized
    this.initialized = true;
  },

  // Create voice chat interface (HTML structure)
  createVoiceChatInterface: function () {
    // Check if voice chat interface AND the messages container already exist
    const existingInterface = document.getElementById("voice-chat-interface");
    const existingMessagesContainer = document.getElementById("voice-messages");

    if (existingInterface && existingMessagesContainer) {
      return;
    }

    // If the interface exists but is incomplete, remove it so we can recreate it properly
    if (existingInterface && !existingMessagesContainer) {
      existingInterface.remove();
    }

    // First, let's add a specific style reset at the beginning of createVoiceChatInterface
    const resetStyle = document.createElement("style");
    resetStyle.innerHTML = `
      #voice-messages {
        padding: 12px !important; 
        padding-top: 0 !important;
        margin: 0 !important;
        background-color: #f2f2f7 !important; /* iOS light gray background */
      }

      #voice-messages::-webkit-scrollbar {
        display: none !important;
      }

      #voice-controls-header {
        margin-bottom: 10px !important;
        margin-top: 0 !important;
        background-color: #f2f2f7 !important;
        position: sticky !important;
        top: 0 !important;
        z-index: 9999999 !important;
        box-shadow: none !important;
        border-bottom: 1px solid rgba(0, 0, 0, 0.1) !important;
        border-radius: 0 !important;
        width: 100% !important;
        left: 0 !important;
        right: 0 !important;
        padding: 8px 12px !important;
        box-sizing: border-box !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
      }

      @keyframes pulseListening {
        0% { transform: scale(1); background: ${this.websiteColor}; }
        50% { transform: scale(1.1); background: ${this.adjustColor(this.websiteColor, -0.2)}; }
        100% { transform: scale(1); background: ${this.websiteColor}; }
      }
      
      @keyframes colorRotate {
        0% { 
          box-shadow: 0 0 20px 5px rgba(136, 43, 230, 0.7);
          background: radial-gradient(circle, rgba(136, 43, 230, 0.8) 0%, rgba(136, 43, 230, 0.4) 70%);
        }
        20% { 
          box-shadow: 0 0 20px 5px rgba(68, 124, 242, 0.7);
          background: radial-gradient(circle, rgba(68, 124, 242, 0.8) 0%, rgba(68, 124, 242, 0.4) 70%);
        }
        33% { 
          box-shadow: 0 0 20px 5px rgba(0, 204, 255, 0.7);
          background: radial-gradient(circle, rgba(0, 204, 255, 0.8) 0%, rgba(0, 204, 255, 0.4) 70%);
        }
        50% { 
          box-shadow: 0 0 20px 5px rgba(0, 220, 180, 0.7);
          background: radial-gradient(circle, rgba(0, 220, 180, 0.8) 0%, rgba(0, 220, 180, 0.4) 70%);
        }
        66% { 
          box-shadow: 0 0 20px 5px rgba(0, 230, 118, 0.7);
          background: radial-gradient(circle, rgba(0, 230, 118, 0.8) 0%, rgba(0, 230, 118, 0.4) 70%);
        }
        83% { 
          box-shadow: 0 0 20px 5px rgba(92, 92, 237, 0.7);
          background: radial-gradient(circle, rgba(92, 92, 237, 0.8) 0%, rgba(92, 92, 237, 0.4) 70%);
        }
        100% { 
          box-shadow: 0 0 20px 5px rgba(136, 43, 230, 0.7);
          background: radial-gradient(circle, rgba(136, 43, 230, 0.8) 0%, rgba(136, 43, 230, 0.4) 70%);
        }
      }
      
      .siri-active {
        position: relative !important;
        animation: colorRotate 8s ease-in-out infinite !important;
        border: none !important;
        overflow: visible !important;
      }
      
      .siri-active::before {
        content: "" !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        border-radius: 50% !important;
        z-index: -1 !important;
        background: rgba(255, 255, 255, 0.15) !important;
        animation: pulseSize 2s ease-in-out infinite !important;
      }
      
      @keyframes pulseSize {
        0% { transform: scale(1); opacity: 0.7; }
        50% { transform: scale(1.2); opacity: 0.3; }
        100% { transform: scale(1); opacity: 0.7; }
      }

      @keyframes thinkingDots {
        0%, 20% { content: '.'; }
        40%, 60% { content: '..'; }
        80%, 100% { content: '...'; }
      }

      .thinking-animation {
        display: inline-block;
        position: relative;
      }

      .thinking-animation::after {
        content: '';
        animation: thinkingDots 1.5s infinite;
      }

      .listening-active {
        animation: pulseListening 1.5s infinite !important;
      }

      .voice-prompt {
        text-align: center;
        color: #666;
        font-size: 14px;
        margin: 15px auto;
        padding: 10px 15px;
        background: #e5e5ea;
        border-radius: 18px;
        width: 80%;
        transition: all 0.3s ease;
        line-height: 1.4;
      }
      
      .welcome-message {
        text-align: center;
        background: linear-gradient(135deg, #f5f7fa 0%, #e6e9f0 100%);
        border-radius: 18px;
        padding: 12px 15px;
        margin: 12px auto;
        width: 85%;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
        position: relative;
        overflow: hidden;
        border: 1px solid rgba(136, 43, 230, 0.1);
        min-height: 100px; /* Ensure consistent height */
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
      
      .welcome-title {
        font-size: 18px;
        font-weight: 700;
        margin-bottom: 5px;
        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
        background: linear-gradient(90deg, var(--voicero-theme-color, ${this.websiteColor}), var(--voicero-theme-color, ${this.websiteColor}));
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        letter-spacing: 0.5px;
      }
      
      .welcome-subtitle {
        font-size: 14px;
        line-height: 1.4;
        color: #666;
        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
        margin-bottom: 3px;
      }
      
      .welcome-highlight {
        color: var(--voicero-theme-color, ${this.websiteColor});
        font-weight: 600;
      }
      
      .welcome-note {
        font-size: 12px;
        opacity: 0.75;
        font-style: italic;
        margin-top: 5px;
        color: #888;
      }
      
      .welcome-pulse {
        display: inline-block;
        width: 8px;
        height: 8px;
        background-color: var(--voicero-theme-color, ${this.websiteColor});
        border-radius: 50%;
        margin-right: 4px;
        animation: welcomePulse 1.5s infinite;
      }
      
      @keyframes welcomePulse {
        0% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.3); opacity: 0.7; }
        100% { transform: scale(1); opacity: 1; }
      }
      
      .user-message {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 16px;
        position: relative;
        padding-right: 8px;
      }

      .user-message .message-content {
        background: ${this.websiteColor || "#882be6"};
        color: white;
        border-radius: 18px;
        padding: 12px 16px;
        max-width: 70%;
        word-wrap: break-word;
        font-size: 14px;
        line-height: 1.4;
        text-align: left;
        box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05);
        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      }

      .ai-message {
        display: flex;
        justify-content: flex-start;
        margin-bottom: 16px;
        position: relative;
        padding-left: 8px;
      }

      .ai-message .message-content {
        background: #e5e5ea;
        color: #333;
        border-radius: 18px;
        padding: 12px 16px;
        max-width: 70%;
        word-wrap: break-word;
        font-size: 14px;
        line-height: 1.4;
        text-align: left;
        box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05);
        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      }
      
      /* iPhone-style message grouping */
      .user-message:not(:last-child) .message-content {
        margin-bottom: 3px;
      }
      
      .ai-message:not(:last-child) .message-content {
        margin-bottom: 3px;
      }
      
      /* Message delivery status */
      .read-status {
        font-size: 11px;
        color: #8e8e93;
        text-align: right;
        margin-top: 2px;
        margin-right: 8px;
      }

      /* Placeholder styling for user message during transcription */
      .user-message .message-content.placeholder-loading {
        font-style: italic;
        color: rgba(255, 255, 255, 0.7);
        background: var(--voicero-theme-color, #882be6);
        opacity: 0.8;
        /* Optional: Add a subtle animation */
        animation: pulsePlaceholder 1.5s infinite ease-in-out;
      }

      @keyframes pulsePlaceholder {
        0% { opacity: 0.6; }
        50% { opacity: 0.9; }
        100% { opacity: 0.6; }
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
      border-radius: 12px;
      box-shadow: none;
      overflow: hidden;
      background: transparent;
      border: none;
      padding: 0;
      backdropFilter: none;
      webkitBackdropFilter: none;
      opacity: 1;
    `;

    // Create messages container
    const messagesContainer = document.createElement("div");
    messagesContainer.id = "voice-messages";
    messagesContainer.setAttribute(
      "style",
      `
      background: #f2f2f7 !important;
      background-color: #f2f2f7 !important;
      border-radius: 12px 12px 0 0 !important;
      padding: 15px !important;
      padding-top: 0 !important;
      margin: 0 !important;
      max-height: 35vh;
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: none !important; /* Firefox */
      -ms-overflow-style: none !important; /* IE and Edge */
      box-shadow: none !important;
      position: relative;
      transition: all 0.3s ease, max-height 0.3s ease, opacity 0.3s ease, padding 0.3s ease;
      width: 100% !important;
      box-sizing: border-box !important;
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
      height: 40px !important;
      background-color: #f2f2f7 !important;
      z-index: 9999999 !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      padding: 10px 15px !important;
      border-bottom: 1px solid rgba(0, 0, 0, 0.1) !important;
      border-radius: 0 !important;
      margin: 0 !important;
      margin-bottom: 15px !important;
      width: 100% !important;
      box-shadow: none !important;
      box-sizing: border-box !important;
      margin-left: 0 !important; 
      margin-right: 0 !important;
    `,
    );

    // Create clear button for the header
    const clearButton = document.createElement("button");
    clearButton.id = "clear-voice-chat";
    clearButton.setAttribute("onclick", "VoiceroVoice.clearChatHistory()");
    clearButton.setAttribute("title", "Clear Chat History");
    clearButton.style.cssText = `
      background: none;
      border: none;
      cursor: pointer;
      padding: 5px 8px;
      border-radius: 15px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      background-color: rgba(0, 0, 0, 0.07);
      font-size: 12px;
      color: #666;
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
    // Replace onclick attribute with event listener that will be added after all buttons are created
    minimizeButton.setAttribute("title", "Minimize");
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
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    `;
    controlsHeader.appendChild(minimizeButton);

    // Create toggle button for the header (to switch to text chat)
    const toggleButton = document.createElement("button");
    toggleButton.id = "toggle-to-text-chat";
    // Replace onclick attribute with event listener that will be added after all buttons are created
    toggleButton.setAttribute("title", "Switch to Text Chat");
    toggleButton.style.cssText = `
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
    toggleButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round">
        <rect x="3" y="5" width="18" height="14" rx="2" ry="2"></rect>
        <path d="M14 9l-2 2-2-2"></path>
        <path d="M12 11v4"></path>
        <line x1="8" y1="16" x2="16" y2="16"></line>
      </svg>
    `;
    controlsHeader.appendChild(toggleButton);

    // Create close button for the header
    const closeButton = document.createElement("button");
    closeButton.id = "close-voice-chat";
    // Replace onclick attribute with event listener that will be added after all buttons are created
    closeButton.setAttribute("title", "Close");
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
      background: linear-gradient(90deg, ${this.websiteColor}, #ff4444, ${this.websiteColor});
      background-size: 200% 100%;
      border-radius: 3px;
      display: none;
      animation: gradientMove 2s linear infinite;
    `;

    // Move the minimize and close buttons to the right container
    rightButtonsContainer.appendChild(minimizeButton);
    rightButtonsContainer.appendChild(toggleButton);
    rightButtonsContainer.appendChild(closeButton);
    controlsHeader.appendChild(rightButtonsContainer);

    // Add event listeners with session status checks
    minimizeButton.addEventListener("click", () => {
      // Check if session operations are in progress
      if (window.VoiceroCore && window.VoiceroCore.isSessionBusy()) {
        console.log(
          "VoiceroVoice: Minimize button click ignored - session operation in progress",
        );
        return;
      }
      VoiceroVoice.minimizeVoiceChat();
    });

    toggleButton.addEventListener("click", () => {
      // Check if session operations are in progress
      if (window.VoiceroCore && window.VoiceroCore.isSessionBusy()) {
        console.log(
          "VoiceroVoice: Toggle button click ignored - session operation in progress",
        );
        return;
      }
      VoiceroVoice.toggleToTextChat();
    });

    closeButton.addEventListener("click", () => {
      // Check if session operations are in progress
      if (window.VoiceroCore && window.VoiceroCore.isSessionBusy()) {
        console.log(
          "VoiceroVoice: Close button click ignored - session operation in progress",
        );
        return;
      }
      VoiceroVoice.closeVoiceChat();
    });

    // First add the controls header to the messages container
    messagesContainer.appendChild(loadingBar);
    messagesContainer.appendChild(controlsHeader);

    // Add a padding div similar to the text interface
    const paddingDiv = document.createElement("div");
    paddingDiv.style.cssText = `
      padding-top: 15px;
    `;
    messagesContainer.appendChild(paddingDiv);

    // Create user message div
    const userMessageDiv = document.createElement("div");
    userMessageDiv.className = "user-message";
    userMessageDiv.style.cssText = `
      margin-bottom: 15px;
      animation: fadeIn 0.3s ease forwards;
    `;
    paddingDiv.appendChild(userMessageDiv);

    // Create input container with border - for the mic button
    const inputContainer = document.createElement("div");
    inputContainer.id = "voice-input-wrapper";
    inputContainer.style.cssText = `
      position: relative;
      padding: 2px;
      background: linear-gradient(90deg, 
        ${this.adjustColor(
          `var(--voicero-theme-color, ${this.websiteColor || "#882be6"})`,
          -0.4,
        )}, 
        ${this.adjustColor(
          `var(--voicero-theme-color, ${this.websiteColor || "#882be6"})`,
          -0.2,
        )}, 
        var(--voicero-theme-color, ${this.websiteColor || "#882be6"}),
        ${this.adjustColor(
          `var(--voicero-theme-color, ${this.websiteColor || "#882be6"})`,
          0.2,
        )}, 
        ${this.adjustColor(
          `var(--voicero-theme-color, ${this.websiteColor || "#882be6"})`,
          0.4,
        )}
      );
      background-size: 500% 100%;
      border-radius: 0 0 12px 12px;
      animation: gradientBorder 15s linear infinite;
      transition: all 0.3s ease;
      box-shadow: none;
      width: 100%;
      box-sizing: border-box;
      margin: 0;
    `;

    // Add maximize button and microphone button - updated with new styles to match text interface
    inputContainer.innerHTML = `
      <button
        id="maximize-voice-chat"
        onclick="VoiceroVoice.maximizeVoiceChat()"
        style="
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          background: ${this.websiteColor || "#882be6"};
          border: none;
          color: white;
          padding: 10px 20px;
          border-radius: 20px 20px 0 0;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          display: none;
          align-items: center;
          justify-content: center;
          min-width: 160px;
          z-index: 999999;
          margin-bottom: -1px;
          height: 40px;
          overflow: visible;
          box-shadow: none;
        "
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
          <polyline points="15 3 21 3 21 9"></polyline>
          <polyline points="9 21 3 21 3 15"></polyline>
          <line x1="21" y1="3" x2="14" y2="10"></line>
          <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
        Open Voice Chat
      </button>
      <div
        style="
          display: flex;
          align-items: center;
          justify-content: center;
          background: white;
          border-radius: 0 0 12px 12px;
          padding: 10px 15px;
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
            background: ${this.websiteColor || "#882be6"};
            border: 2px solid transparent;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: none;
            position: relative;
            padding: 0;
          "
        >
          <svg
            id="mic-icon"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            style="
              display: block;
              margin: auto;
              position: relative;
            "
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
    if (!messagesContainer) {
      return;
    }

    // Check if user and AI message divs exist
    const userMessageExists =
      messagesContainer.querySelector(".user-message") !== null;
    const aiMessageExists =
      messagesContainer.querySelector(".ai-message") !== null;

    // Add interface elements to the DOM in proper order
    interfaceContainer.appendChild(messagesContainer);
    interfaceContainer.appendChild(inputContainer);

    // Verify before adding to body

    // Add to document body
    document.body.appendChild(interfaceContainer);

    // Verify after adding to DOM
    const verifyMessagesContainer = document.getElementById("voice-messages");
    const verifyUserMessage = document.querySelector(".user-message");
    const verifyAiMessage = document.querySelector(".ai-message");

    // After creating all elements, set the padding again to override any potential changes
    setTimeout(() => {
      const messagesEl = document.getElementById("voice-messages");
      if (messagesEl) {
        messagesEl.style.padding = "15px";
        messagesEl.style.paddingTop = "0"; // Keep top padding at 0 for header
        messagesEl.style.backgroundColor = "#f2f2f7";
        messagesEl.style.width = "100%";
        messagesEl.style.boxSizing = "border-box";
        messagesEl.style.margin = "0";
      }

      // Ensure header styling is applied
      const headerEl = document.getElementById("voice-controls-header");
      if (headerEl) {
        headerEl.style.position = "sticky";
        headerEl.style.top = "0";
        headerEl.style.backgroundColor = "#f2f2f7";
        headerEl.style.zIndex = "9999999";
        headerEl.style.borderRadius = "0";
        headerEl.style.borderBottom = "1px solid rgba(0, 0, 0, 0.1)";
        headerEl.style.width = "100%";
        headerEl.style.left = "0";
        headerEl.style.right = "0";
        headerEl.style.margin = "0 0 15px 0";
        headerEl.style.boxShadow = "none";
        headerEl.style.boxSizing = "border-box";
        headerEl.style.padding = "10px 15px";
      }

      // Ensure input wrapper styling
      const inputWrapperEl = document.getElementById("voice-input-wrapper");
      if (inputWrapperEl) {
        inputWrapperEl.style.width = "100%";
        inputWrapperEl.style.boxSizing = "border-box";
        inputWrapperEl.style.margin = "0";
        inputWrapperEl.style.borderRadius = "0 0 12px 12px";
      }

      // Ensure maximize button styling when visible
      const maximizeBtn = document.getElementById("maximize-voice-chat");
      if (maximizeBtn) {
        maximizeBtn.style.marginBottom = "-2px"; // Slight overlap with container for seamless appearance
        maximizeBtn.style.height = "40px";
        maximizeBtn.style.overflow = "visible";
        maximizeBtn.style.width = "auto"; // Allow button to size to content
        maximizeBtn.style.minWidth = "160px"; // Ensure minimum width
        maximizeBtn.style.position = "absolute";
        maximizeBtn.style.bottom = "100%";
        maximizeBtn.style.left = "50%";
        maximizeBtn.style.transform = "translateX(-50%)";
      }
    }, 100);
  },

  isOpeningVoiceChat: false,

  // Open voice chat interface
  openVoiceChat: function () {
    // Sync theme color before opening
    this.syncThemeColor();

    console.log("VoiceroVoice: Opening voice chat interface");

    // Set current time to prevent reopening too quickly
    this.lastOpenTime = Date.now();

    // Set flag to prevent closing the interface too quickly
    this.isOpeningVoiceChat = true;
    this.isClosingVoiceChat = false; // Reset closing flag

    // Check if we have existing messages
    const hasMessages =
      VoiceroCore &&
      VoiceroCore.appState &&
      VoiceroCore.appState.voiceMessages &&
      (VoiceroCore.appState.voiceMessages.user ||
        VoiceroCore.appState.voiceMessages.ai);

    // MODIFIED: Always show welcome if no messages, otherwise use session preference
    let shouldShowWelcome = !hasMessages;

    // If we have a session with voiceWelcome defined AND there are messages, use that value
    if (
      hasMessages &&
      window.VoiceroCore &&
      window.VoiceroCore.session &&
      typeof window.VoiceroCore.session.voiceWelcome !== "undefined"
    ) {
      shouldShowWelcome = window.VoiceroCore.session.voiceWelcome;
    }

    // Update window state - Always open maximized, minimize only after fully loaded if needed
    if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
      console.log(
        "VoiceroVoice: Updating window state - voice open (maximized)",
      );
      window.VoiceroCore.updateWindowState({
        voiceOpen: true,
        voiceOpenWindowUp: true, // Always start maximized
        voiceWelcome: shouldShowWelcome,
        coreOpen: false,
        textOpen: false,
        textOpenWindowUp: false,
      });
    }

    // Close text interface if it's open
    const textInterface = document.getElementById(
      "voicero-text-chat-container",
    );
    if (textInterface && textInterface.style.display === "block") {
      if (window.VoiceroText && window.VoiceroText.closeTextChat) {
        window.VoiceroText.closeTextChat();
      } else {
        textInterface.style.display = "none";
      }
    }

    // First make sure we have created the interface
    this.createVoiceChatInterface();

    // Let VoiceroCore handle hiding buttons and chooser - we don't touch them at all

    // Show the voice interface
    const voiceInterface = document.getElementById("voice-chat-interface");
    if (voiceInterface) {
      console.log("VoiceroVoice: Displaying voice interface");
      // Position in lower middle of screen
      voiceInterface.style.cssText = `
        position: fixed !important;
        left: 50% !important;
        bottom: 20px !important;
        transform: translateX(-50%) !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        z-index: 999999 !important;
        width: 85% !important;
        max-width: 480px !important;
        min-width: 280px !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        border-radius: 12px 12px 0 0 !important;
      `;
    }

    // Load message history from session before deciding whether to show welcome message
    this.loadMessagesFromSession();

    // Check if we have messages after loading from session
    const messagesContainer = document.getElementById("voice-messages");
    const existingMessages = messagesContainer
      ? messagesContainer.querySelectorAll(
          ".user-message .message-content, .ai-message .message-content",
        )
      : [];

    // Show welcome message if needed and no messages were loaded from session
    if (
      messagesContainer &&
      shouldShowWelcome &&
      existingMessages.length === 0
    ) {
      // Check if a welcome message already exists
      const existingWelcomeMessage =
        messagesContainer.querySelector(".welcome-message");

      // Only show welcome message if one doesn't already exist
      if (!existingWelcomeMessage) {
        // Add welcome message with clear prompt
        this.addSystemMessage(`
          <div class="welcome-message" style="width: 90% !important; max-width: 400px !important; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08) !important; background: linear-gradient(135deg, #f5f7fa 0%, #e6e9f0 100%) !important; border: none !important; padding: 20px 15px !important; margin: 15px auto !important;">
            <div class="welcome-title" style="background: linear-gradient(90deg, var(--voicero-theme-color, ${this.websiteColor}), var(--voicero-theme-color, ${this.websiteColor})) text; -webkit-text-fill-color: transparent; margin-bottom: 5px; font-size: 18px;">Aura, your website concierge</div>
            <div class="welcome-subtitle" style="margin-bottom: 3px; font-size: 14px;">Click mic & <span class="welcome-highlight" style="color: var(--voicero-theme-color, ${this.websiteColor});">start talking</span></div>
            <div class="welcome-note" style="margin-top: 5px; font-size: 12px;"><span class="welcome-pulse" style="background-color: var(--voicero-theme-color, ${this.websiteColor}); width: 8px; height: 8px;"></span>Button glows during conversation</div>
          </div>
        `);

        // Force welcome message heights
        setTimeout(() => this.forceWelcomeMessageHeight(), 100);
      }
    } else {
      console.log("VoiceroVoice: No welcome message needed", {
        shouldShowWelcome,
        existingMessagesLength: existingMessages.length,
      });
    }

    // After the interface is fully loaded and visible, check if it should be minimized
    // based on the previous session state (delayed to prevent race conditions)
    setTimeout(() => {
      // Now check if we should be minimized according to session preferences
      // We only check this AFTER ensuring the interface is visible
      if (
        window.VoiceroCore &&
        window.VoiceroCore.session &&
        window.VoiceroCore.session.voiceOpenWindowUp === false &&
        !this.isClosingVoiceChat
      ) {
        console.log(
          "VoiceroVoice: Session preference is minimized - minimizing after UI is ready",
        );
        this.isOpeningVoiceChat = false; // Clear flag to allow minimizing
        this.minimizeVoiceChat();
      } else {
        console.log("VoiceroVoice: Resetting opening flag");
        this.isOpeningVoiceChat = false;
      }
    }, 1500);
  },

  // Minimize voice chat interface
  minimizeVoiceChat: function () {
    console.log("VoiceroVoice: Minimizing voice chat");

    // Prevent minimize if a close is in progress
    if (this.isClosingVoiceChat) {
      console.log(
        "VoiceroVoice: Skipping minimize because close is in progress",
      );
      return;
    }

    // Check if we're in the process of opening the voice chat
    if (this.isOpeningVoiceChat) {
      console.log("VoiceroVoice: Cannot minimize - currently opening");

      // Schedule another minimize attempt after opening completes
      setTimeout(() => {
        if (!this.isOpeningVoiceChat && !this.isClosingVoiceChat) {
          console.log("VoiceroVoice: Delayed minimize attempt");
          this.minimizeVoiceChat();
        }
      }, 2000);

      return; // Don't proceed with minimizing
    }

    // Update window state
    if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
      window.VoiceroCore.updateWindowState({
        voiceOpen: true,
        voiceOpenWindowUp: false,
        coreOpen: false,
        textOpen: false,
        textOpenWindowUp: false,
      });
    }

    // Get the messages container
    const messagesContainer = document.getElementById("voice-messages");
    const headerContainer = document.getElementById("voice-controls-header");
    const inputWrapper = document.getElementById("voice-input-wrapper");
    const maximizeButton = document.getElementById("maximize-voice-chat");

    if (messagesContainer) {
      // Hide all message content
      const allMessages = messagesContainer.querySelectorAll(
        ".user-message, .ai-message",
      );
      allMessages.forEach((msg) => {
        msg.style.display = "none";
      });

      // Collapse the messages container
      messagesContainer.style.maxHeight = "0";
      messagesContainer.style.minHeight = "0";
      messagesContainer.style.height = "0";
      messagesContainer.style.opacity = "0";
      messagesContainer.style.padding = "0";
      messagesContainer.style.overflow = "hidden";
      messagesContainer.style.border = "none";
    }

    // Hide the header
    if (headerContainer) {
      headerContainer.style.display = "none";
    }

    // Adjust the input wrapper to connect with the button
    if (inputWrapper) {
      inputWrapper.style.borderRadius = "12px";
      inputWrapper.style.marginTop = "36px"; // Space for the button (slightly less than height to overlap)
    }

    // Show the maximize button
    if (maximizeButton) {
      maximizeButton.style.display = "flex";
      maximizeButton.style.zIndex = "9999999";
      maximizeButton.style.marginBottom = "-2px"; // Slight overlap to ensure connection
      maximizeButton.style.height = "40px";
      maximizeButton.style.overflow = "visible";
      maximizeButton.style.bottom = inputWrapper
        ? inputWrapper.offsetTop - 38 + "px"
        : "100%";
    }

    // Force a redraw to ensure button is visible WITHOUT hiding the interface
    const voiceInterface = document.getElementById("voice-chat-interface");
    if (voiceInterface) {
      // Ensure the interface remains visible
      voiceInterface.style.display = "block";
      voiceInterface.style.visibility = "visible";
      voiceInterface.style.opacity = "1";

      // Position the button properly
      if (maximizeButton && inputWrapper) {
        maximizeButton.style.position = "absolute";
        maximizeButton.style.bottom = "100%";
        maximizeButton.style.left = "50%";
        maximizeButton.style.transform = "translateX(-50%)";
      }
    }

    console.log("VoiceroVoice: Minimization complete");
  },

  // Maximize voice chat interface
  maximizeVoiceChat: function () {
    console.log("VoiceroVoice: Maximizing voice chat");

    // Check if we're in the process of opening or closing
    if (this.isOpeningVoiceChat || this.isClosingVoiceChat) {
      console.log(
        "VoiceroVoice: Cannot maximize - interface busy (opening or closing)",
      );
      setTimeout(() => {
        if (!this.isOpeningVoiceChat && !this.isClosingVoiceChat) {
          this.maximizeVoiceChat();
        }
      }, 1000);
      return;
    }

    // Update window state
    if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
      window.VoiceroCore.updateWindowState({
        voiceOpen: true,
        voiceOpenWindowUp: true,
        coreOpen: false,
        textOpen: false,
        textOpenWindowUp: false,
      });
    }

    this.reopenVoiceChat();

    // Remove any voice prompts, placeholders, typing indicators, or empty message bubbles
    const messagesContainer = document.getElementById("voice-messages");
    if (messagesContainer) {
      // Remove system/placeholder elements except welcome message
      messagesContainer
        .querySelectorAll(".voice-prompt, .placeholder, .typing-indicator")
        .forEach((el) => el.remove());
      // Remove empty message bubbles
      messagesContainer
        .querySelectorAll(".ai-message, .user-message")
        .forEach((msg) => {
          const textEl = msg.querySelector(".message-content");
          if (!textEl || !textEl.textContent.trim()) {
            msg.remove();
          }
        });
      // First immediate scroll
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      // Then scroll again after a short delay to ensure it works after any animations
      setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }, 300);
    }

    console.log("VoiceroVoice: Maximization complete");
  },

  // Close voice chat interface only - don't show anything else
  closeVoiceChat: function () {
    console.log("VoiceroVoice: Closing voice chat");

    // Set closing flag
    this.isClosingVoiceChat = true;

    // First create reliable references to the elements we need
    const voiceInterface = document.getElementById("voice-chat-interface");

    // Update window state first - this is critical
    if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
      window.VoiceroCore.updateWindowState({
        voiceOpen: false,
        voiceOpenWindowUp: false,
        coreOpen: true, // Set coreOpen to true when closing voice chat
        textOpen: false,
        autoMic: false,
        textOpenWindowUp: false,
      });
    }

    // Hide voice interface
    if (voiceInterface) {
      voiceInterface.style.display = "none";
    }

    // Let VoiceroCore handle the button visibility
    if (window.VoiceroCore) {
      window.VoiceroCore.ensureMainButtonVisible();
    }

    // Reset closing flag
    this.isClosingVoiceChat = false;
  },

  /**
   * Toggle microphone recording
   * @param {string} source - "manual" if user clicked the mic button, "auto" if triggered programmatically (silence/timeout).
   */
  // CHANGED: added a `source = "manual"` parameter
  toggleMic: function (source = "manual") {
    const micButton = document.getElementById("voice-mic-button");
    const micIcon = document.getElementById("mic-icon");

    // If the voice chat is minimized and we're about to start recording, reopen it
    if (
      !this.isRecording &&
      VoiceroCore &&
      VoiceroCore.appState &&
      VoiceroCore.appState.isVoiceMinimized
    ) {
      this.reopenVoiceChat();
    }

    if (this.isRecording) {
      // Stop listening
      this.isRecording = false;

      if (source === "manual") {
        // Turn off autoMic in session when user manually stops recording
        if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
          window.VoiceroCore.updateWindowState({
            autoMic: false,
          });
        }
      }

      // Update UI - remove siri animation
      micButton.classList.remove("siri-active");
      micButton.style.background = this.websiteColor || "#882be6";
      micButton.style.borderColor = "transparent";
      micButton.style.boxShadow = "0 4px 15px rgba(0, 0, 0, 0.1)";
      micIcon.style.stroke = "white";

      // Remove the "I'm listening..." indicator if it exists
      const listeningIndicator = document.getElementById(
        "listening-indicator-message",
      );
      if (listeningIndicator) {
        listeningIndicator.remove();
      }

      // Also remove any leftover placeholders or typing indicators
      document
        .querySelectorAll(
          ".placeholder, .typing-indicator, .welcome-message, .voice-prompt",
        )
        .forEach((el) => el.remove());

      // Force maximize the chat window when stopping recording
      // First update the window state to ensure it's marked as maximized
      if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
        window.VoiceroCore.updateWindowState({
          voiceOpen: true,
          voiceOpenWindowUp: true,
          isVoiceMinimized: false,
        });
      }

      // Then force maximize
      this.maximizeVoiceChat();

      // Ensure we scroll to the bottom after maximizing
      const messagesContainer = document.getElementById("voice-messages");
      if (messagesContainer) {
        // First immediate scroll
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Then scroll again after a short delay to ensure it works after any animations
        setTimeout(() => {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 300);
      }

      // Rest of the existing stop listening logic
      if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
        this.audioChunks = [];
        this.mediaRecorder.stop();
        if (this.recordingTimeout) {
          clearTimeout(this.recordingTimeout);
          this.recordingTimeout = null;
        }
        if (this.silenceDetectionTimer) {
          clearInterval(this.silenceDetectionTimer);
          this.silenceDetectionTimer = null;
        }
      }

      if (this.currentAudioStream) {
        this.currentAudioStream.getTracks().forEach((track) => track.stop());
        this.currentAudioStream = null;
      }
    } else {
      // Start listening
      this.isRecording = true;
      this.manuallyStoppedRecording = false;

      // Update window state to indicate welcome has been shown
      if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
        window.VoiceroCore.updateWindowState({
          voiceWelcome: false, // Once user starts recording, don't show welcome again
          autoMic: false, // Set autoMic to false to remember user's preference
        });
      }

      // Add a temporary "initializing..." message instead of immediately showing "I'm listening..."
      this.addSystemMessage(`
        <div id="listening-indicator-message" class="welcome-message" style="width: 90% !important; max-width: 400px !important; padding: 20px 15px !important; margin: 15px auto !important; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08) !important; background: linear-gradient(135deg, #f5f7fa 0%, #e6e9f0 100%) !important; border: none !important;">
          <div class="welcome-title" style="background: linear-gradient(90deg, var(--voicero-theme-color, ${this.websiteColor}), var(--voicero-theme-color, ${this.websiteColor})) text; -webkit-text-fill-color: transparent; margin-bottom: 5px; font-size: 18px;">
            Initializing microphone...
          </div>
        </div>
      `);

      // Force welcome message heights
      setTimeout(() => this.forceWelcomeMessageHeight(), 100);

      // Reset silence detection variables
      this.silenceTime = 0;
      this.isSpeaking = false;
      this.hasStartedSpeaking = false;

      // Check if mediaDevices and getUserMedia are supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.isRecording = false;

        // Show error message
        micButton.classList.remove("siri-active");
        micButton.style.background = this.websiteColor || "#882be6";
        micButton.style.borderColor = "transparent";
        micButton.style.boxShadow = "0 4px 15px rgba(0, 0, 0, 0.1)";

        this.addSystemMessage(`
          <div class="voice-prompt" style="background: #ffeded; color: #d43b3b;">
            Microphone access not supported in this browser. Try using Chrome, Firefox or Safari.
          </div>
        `);
        return;
      }

      // Check if AudioContext is supported
      const audioContextSupported = this.isAudioContextSupported();

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
          // Log audio track settings to help with debugging
          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length > 0) {
            const settings = audioTracks[0].getSettings();
          }

          this.currentAudioStream = stream;

          // Create media recorder with higher bitrate
          this.mediaRecorder = new MediaRecorder(stream, {
            mimeType: "audio/webm;codecs=opus",
            audioBitsPerSecond: 128000,
          });
          this.audioChunks = [];

          // NOW update UI - add siri-like animation after microphone is activated
          micButton.classList.add("siri-active");
          micIcon.style.stroke = "white";

          // Update the message to "I'm listening..." now that the mic is ready
          const listeningIndicator = document.getElementById(
            "listening-indicator-message",
          );
          if (listeningIndicator) {
            const titleElement =
              listeningIndicator.querySelector(".welcome-title");
            if (titleElement) {
              titleElement.textContent = "I'm listening...";
            }
          }

          // Set up audio analysis for silence detection if supported
          if (audioContextSupported) {
            try {
              // Cross-browser compatible AudioContext initialization
              const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;
              this.audioContext = new AudioContextClass();
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
                  }
                } else {
                  if (this.isSpeaking) {
                    this.silenceTime += 100; // Interval is 100ms

                    // Removed auto-stopping of recording after silence
                    // Only log the silence for debugging purposes
                    if (this.silenceTime > 500 && this.hasStartedSpeaking) {
                    }
                  }
                }
              }, 100);
            } catch (error) {}
          }

          // Handle data available event
          this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              this.audioChunks.push(event.data);
            }
          };

          this.mediaRecorder.onstop = async () => {
            // Check if recording was manually stopped by the user
            if (this.manuallyStoppedRecording) {
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

            // Create audio blob from chunks
            const audioBlob = new Blob(this.audioChunks, {
              type: "audio/webm",
            });

            // Only process if we have actual audio data
            if (audioBlob.size > 0) {
              try {
                // Send to Whisper API for transcription via WordPress proxy
                const formData = new FormData();
                formData.append("audio", audioBlob, "recording.webm");
                formData.append("url", window.location.href);
                formData.append(
                  "threadId",
                  VoiceroCore ? VoiceroCore.currentThreadId || "" : "",
                );

                const whisperResponse = await fetch(
                  "https://www.voicero.ai/api/whisper",
                  {
                    method: "POST",
                    headers: {
                      ...(window.voiceroConfig?.getAuthHeaders
                        ? window.voiceroConfig.getAuthHeaders()
                        : {}),
                    },
                    body: formData,
                  },
                );

                if (!whisperResponse.ok) {
                  let errorText;
                  try {
                    const errorData = await whisperResponse.json();
                    errorText = JSON.stringify(errorData);
                  } catch (e) {
                    // If JSON parsing fails, get text response instead
                    errorText = await whisperResponse.text();
                  }

                  throw new Error(
                    `Whisper API request failed with status ${whisperResponse.status}`,
                  );
                }

                const whisperData = await whisperResponse.json();

                // Extract the transcription - ensure we get a string
                const transcription =
                  whisperData.transcription ||
                  (whisperData.text && typeof whisperData.text === "string"
                    ? whisperData.text
                    : typeof whisperData === "object" && whisperData.text
                      ? whisperData.text
                      : "Could not transcribe audio");

                // CHECK IF TRANSCRIPTION IS MEANINGFUL
                // If Whisper returns an empty string, very short nonsense, or the default error message, don't process further
                if (
                  !transcription ||
                  transcription.trim() === "" ||
                  transcription === "Could not transcribe audio" ||
                  transcription.length < 2
                ) {
                  console.log(
                    "Voice interface: Empty or invalid transcription detected, stopping processing",
                  );
                  // Show a message to the user that nothing was heard
                  this.addSystemMessage(`
                    <div class="voice-prompt" style="background: #e5e5ea; color: #666;">
                      I didn't hear anything. Please try speaking again.
                    </div>
                  `);
                  return;
                }

                // Additional checks for nonsensical transcriptions
                const cleanedTranscription = transcription.trim();
                const wordCount = cleanedTranscription.split(/\s+/).length;

                // Common patterns of random noise transcriptions
                const appearsToBeForeignOrNonsense = (text) => {
                  // Check for transcripts that are just a few random characters
                  if (
                    text.length < 5 &&
                    !/^(hi|hey|yo|yes|no|ok)$/i.test(text)
                  ) {
                    return true;
                  }

                  // Check for very short transcripts that don't form common words or questions
                  if (
                    wordCount <= 2 &&
                    text.length < 12 &&
                    !/(hi|hey|yo|yes|no|ok|what|who|when|where|why|how|can|help|thanks|is|are)/i.test(
                      text,
                    )
                  ) {
                    return true;
                  }

                  // Check for random character sequences often produced with background noise
                  if (
                    /^[a-z]{1,2}[aeiou]{1,2}[a-z]{1,2}$/i.test(text) ||
                    /^[^a-z0-9\s]{3,}$/i.test(text)
                  ) {
                    return true;
                  }

                  return false;
                };

                if (appearsToBeForeignOrNonsense(cleanedTranscription)) {
                  console.log(
                    "Voice interface: Nonsensical transcription detected:",
                    cleanedTranscription,
                  );

                  return;
                }

                // Add the user message with transcription (restored from placeholder update)
                this.addMessage(transcription, "user");

                // Mark that first conversation has occurred
                if (VoiceroCore && VoiceroCore.appState) {
                  VoiceroCore.appState.hasHadFirstConversation = true;
                  VoiceroCore.saveState();
                }

                // Show typing indicator instead of text placeholder
                this.addTypingIndicator();

                // Now send the transcription to the Shopify chat endpoint
                const requestBody = {
                  message: transcription,
                  type: "voice",
                  threadId:
                    this.currentThreadId ||
                    (window.VoiceroCore &&
                    window.VoiceroCore.thread &&
                    window.VoiceroCore.thread.threadId
                      ? window.VoiceroCore.thread.threadId
                      : null),
                  websiteId:
                    window.VoiceroCore && window.VoiceroCore.websiteId
                      ? window.VoiceroCore.websiteId
                      : null,
                  currentPageUrl: window.location.href,
                  pageData: this.collectPageData(),
                  pastContext: this.getPastContext(),
                };

                // Log the request body for debugging
                console.log(
                  "[VOICERO VOICE] Sending to /chat:",
                  JSON.stringify(requestBody, null, 2),
                );

                const chatResponse = await fetch(
                  "https://www.voicero.ai/api/shopify/chat",
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Accept: "application/json",
                      ...(window.voiceroConfig?.getAuthHeaders
                        ? window.voiceroConfig.getAuthHeaders()
                        : {}),
                    },
                    body: JSON.stringify(requestBody),
                  },
                );
                if (!chatResponse.ok)
                  throw new Error("Chat API request failed");

                const chatData = await chatResponse.json();

                // Log the response data for debugging
                console.log(
                  "[VOICERO VOICE] Received from /chat:",
                  JSON.stringify(chatData, null, 2),
                );

                // Store thread ID from response
                if (chatData.threadId) {
                  this.currentThreadId = chatData.threadId;

                  // Update VoiceroCore thread reference if available
                  if (
                    window.VoiceroCore &&
                    window.VoiceroCore.session &&
                    window.VoiceroCore.session.threads
                  ) {
                    // Find the matching thread in the threads array
                    const matchingThread =
                      window.VoiceroCore.session.threads.find(
                        (thread) => thread.threadId === chatData.threadId,
                      );

                    if (matchingThread) {
                      // Update VoiceroCore.thread reference
                      window.VoiceroCore.thread = matchingThread;
                    }
                  }

                  // Update window state to save the thread ID
                  if (
                    window.VoiceroCore &&
                    window.VoiceroCore.updateWindowState
                  ) {
                    window.VoiceroCore.updateWindowState({
                      voiceWelcome: false,
                      threadId: chatData.threadId,
                    });
                  }
                }

                // Get the text response - now properly handling JSON response formats
                let aiTextResponse = "";
                let actionType = null;
                let actionUrl = null;
                let actionContext = null;

                try {
                  // First check if the response is already an object
                  if (
                    typeof chatData.response === "object" &&
                    chatData.response !== null
                  ) {
                    aiTextResponse =
                      chatData.response.answer ||
                      "Sorry, I don't have a response.";
                    actionType = chatData.response.action || null;

                    // Check for action_context first (new format)
                    if (chatData.response.action_context) {
                      actionContext = chatData.response.action_context;

                      // If it's a redirect action, get the URL from action_context
                      if (actionType === "redirect" && actionContext.url) {
                        actionUrl = actionContext.url;
                      }
                    }

                    // Fallback to old format if no URL found in action_context
                    if (!actionUrl) {
                      actionUrl = chatData.response.url || null;
                    }
                  }
                  // Then try to parse the response as JSON if it's a string
                  else if (typeof chatData.response === "string") {
                    try {
                      const parsedResponse = JSON.parse(chatData.response);
                      aiTextResponse =
                        parsedResponse.answer ||
                        "Sorry, I don't have a response.";
                      actionType = parsedResponse.action || null;

                      // Check for action_context first (new format)
                      if (parsedResponse.action_context) {
                        actionContext = parsedResponse.action_context;

                        // If it's a redirect action, get the URL from action_context
                        if (actionType === "redirect" && actionContext.url) {
                          actionUrl = actionContext.url;
                        }
                      }

                      // Fallback to old format if no URL found in action_context
                      if (!actionUrl) {
                        actionUrl = parsedResponse.url || null;
                      }
                    } catch (e) {
                      // If parsing fails, use the response as is
                      aiTextResponse =
                        chatData.response || "Sorry, I don't have a response.";
                    }
                  } else {
                    // Fallback
                    aiTextResponse =
                      chatData.response || "Sorry, I don't have a response.";
                  }
                } catch (error) {
                  aiTextResponse = "Sorry, I don't have a response.";
                }

                // Process text to extract and clean URLs - making sure we have a string
                if (typeof aiTextResponse !== "string") {
                  aiTextResponse = String(aiTextResponse);
                }

                // Process text to extract and clean URLs
                const processedResponse =
                  this.extractAndCleanUrls(aiTextResponse);
                const cleanedTextResponse = processedResponse.text;
                const extractedUrls = processedResponse.urls;

                try {
                  // Request audio generation using TTS endpoint
                  const ttsResponse = await fetch(
                    "https://www.voicero.ai/api/tts",
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...(window.voiceroConfig?.getAuthHeaders
                          ? window.voiceroConfig.getAuthHeaders()
                          : {}),
                      },
                      body: JSON.stringify({
                        text: cleanedTextResponse, // Send cleaned text to TTS
                      }),
                    },
                  );

                  if (!ttsResponse.ok) {
                    let details;
                    try {
                      details = JSON.stringify(await ttsResponse.json());
                    } catch {
                      details = await ttsResponse.text();
                    }
                    throw new Error(
                      `TTS request failed (${
                        ttsResponse.status
                      }): ${details.substring(0, 200)}`,
                    );
                  }

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

                  const contentType = ttsResponse.headers.get("Content-Type");
                  let audio;

                  if (contentType && contentType.includes("audio/")) {
                    // Handle binary audio response
                    const audioBlob = await ttsResponse.blob();
                    const audioUrl = URL.createObjectURL(audioBlob);
                    audio = new Audio(audioUrl);
                  } else {
                    // Handle JSON response with URL
                    const responseData = await ttsResponse.json();
                    const { success, url } = responseData;

                    if (!success || !url) {
                      throw new Error("Malformed TTS response (no URL)");
                    }

                    // Play the audio response from the URL
                    audio = new Audio(url);
                  }

                  // Create a promise to handle audio completion
                  const audioPlaybackPromise = new Promise((resolve) => {
                    audio.addEventListener("ended", () => {
                      resolve();
                    });

                    // Also handle errors in playback by resolving
                    audio.addEventListener("error", () => {
                      console.warn(
                        "Audio playback error - continuing with actions anyway",
                      );
                      resolve();
                    });
                  });

                  // Start audio playback
                  await audio.play();

                  // Wait for audio to complete playing before proceeding
                  await audioPlaybackPromise;

                  // Handle actions ONLY AFTER audio playback completes
                  if (window.VoiceroActionHandler) {
                    try {
                      window.VoiceroActionHandler.handle(
                        chatData.response ?? chatData,
                      );
                    } catch (err) {
                      // console.error("VoiceroActionHandler error:", err);
                    }
                  }

                  // After audio playback completes, handle redirect action or URL
                  if (actionType === "redirect" && actionUrl) {
                    this.redirectToUrl(actionUrl);
                  }
                  // If no action but we have extracted URLs, use the first one
                  else if (extractedUrls.length > 0) {
                    this.redirectToUrl(extractedUrls[0]);
                  }
                } catch (audioError) {
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

                  // Handle redirect even if audio failed, but with a longer delay to allow reading the message
                  if (actionType === "redirect" && actionUrl) {
                    // Use a longer delay for error cases to allow reading the message
                    const redirectDelay = 5000; // 5 seconds to read message

                    // Add a delay before redirecting
                    setTimeout(() => {
                      this.redirectToUrl(actionUrl);
                    }, redirectDelay);
                  }
                  // If no action but we have extracted URLs, use the first one
                  else if (extractedUrls.length > 0) {
                    // Use a longer delay for error cases
                    const redirectDelay = 5000; // 5 seconds to read message

                    // Add a delay before redirecting
                    setTimeout(() => {
                      this.redirectToUrl(extractedUrls[0]);
                    }, redirectDelay);
                  }
                }
              } catch (error) {
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
                  this.audioContext = null;
                  this.analyser = null;
                })
                .catch((err) => {
                  this.audioContext = null;
                  this.analyser = null;
                });
            }
          };

          // Start the audio capture
          this.mediaRecorder.start();
          this.isRecording = true;

          // Set a timeout to automatically end the conversation after 30 seconds
          this.recordingTimeout = setTimeout(() => {
            if (
              this.isRecording &&
              this.mediaRecorder &&
              this.mediaRecorder.state !== "inactive"
            ) {
              // CHANGED: pass "auto" to differentiate from user stop
              this.toggleMic("auto"); // End the conversation
            }
          }, 30000); // 30 seconds
        })
        .catch((error) => {
          // Reset UI
          micButton.classList.remove("siri-active");
          micButton.style.background = this.websiteColor || "#882be6";
          micButton.style.borderColor = "transparent";
          micButton.style.boxShadow = "0 4px 15px rgba(0, 0, 0, 0.1)";
          this.isRecording = false;

          // Show error message in the voice interface
          this.addSystemMessage(`
            <div class="voice-prompt" style="background: #ffeded; color: #d43b3b;">
              Please allow microphone access to use voice chat.
            </div>
          `);
        });
    }
  },

  // Improved audio playback function with fallback methods
  playAudioResponse: async function (audioBlob) {
    return new Promise((resolve, reject) => {
      try {
        // Create a properly typed blob to ensure browser compatibility
        // Some browsers are stricter about MIME types, so let's ensure we use the exact correct one
        const properBlob = new Blob([audioBlob], {
          type: audioBlob.type || "audio/mpeg",
        });

        // Track if playback has been successful with any method
        let playbackSucceeded = false;

        // Try using the Web Audio API for better browser support first
        this.playWithWebAudio(properBlob, resolve)
          .then(() => {
            playbackSucceeded = true;
            resolve();
          })
          .catch((error) => {
            tryFallbackMethod();
          });

        // Check if AudioContext is supported and try it first
        function tryAudioContext() {
          const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;

          if (AudioContextClass) {
            const audioContext = new AudioContextClass();
            const fileReader = new FileReader();

            fileReader.onload = function () {
              const arrayBuffer = this.result;

              // Decode the audio data
              audioContext.decodeAudioData(
                arrayBuffer,
                function (buffer) {
                  // Create a source node
                  const source = audioContext.createBufferSource();
                  source.buffer = buffer;

                  // Connect to destination (speakers)
                  source.connect(audioContext.destination);

                  // Play the audio
                  source.onended = function () {
                    playbackSucceeded = true;
                    resolve();
                  };

                  source.start(0);
                },
                function (error) {
                  // Always fall back to the Audio element method when decoding fails
                  tryFallbackMethod();
                },
              );
            };

            fileReader.onerror = function () {
              tryFallbackMethod();
            };

            // Read the blob as an array buffer
            fileReader.readAsArrayBuffer(properBlob);
            return true;
          }

          return false;
        }

        // Fallback method using Audio element (less reliable but simpler)
        function tryFallbackMethod() {
          const audio = new Audio();

          // Add event listeners
          audio.onloadedmetadata = () => {};

          audio.onended = () => {
            if (audio.src && audio.src.startsWith("blob:")) {
              URL.revokeObjectURL(audio.src);
            }
            resolve();
          };

          audio.onerror = (error) => {
            // Try alternative audio format as last resort
            tryMP3Fallback();

            // Clean up and resolve anyway to continue with the conversation
            if (audio.src && audio.src.startsWith("blob:")) {
              URL.revokeObjectURL(audio.src);
            }
            resolve(); // Resolve instead of reject to continue with the conversation
          };

          // Create a blob URL
          const audioUrl = URL.createObjectURL(properBlob);

          audio.src = audioUrl;

          // Start playback
          audio
            .play()
            .then(() => {})
            .catch((err) => {
              // Try MP3 fallback as last resort
              tryMP3Fallback();

              if (audio.src && audio.src.startsWith("blob:")) {
                URL.revokeObjectURL(audio.src);
              }
              resolve(); // Resolve instead of reject to continue with the conversation
            });
        }

        // Last resort fallback for browsers with limited codec support
        function tryMP3Fallback() {
          // Try multiple formats to see if any works
          tryFormat("audio/mpeg");

          function tryFormat(mimeType) {
            // Force specific MIME type
            const formatBlob = new Blob([audioBlob], { type: mimeType });
            const formatAudio = new Audio();
            const formatUrl = URL.createObjectURL(formatBlob);

            formatAudio.src = formatUrl;
            formatAudio.onended = () => {
              URL.revokeObjectURL(formatUrl);
            };

            formatAudio.onerror = () => {
              URL.revokeObjectURL(formatUrl);

              // Try wav format if mp3 fails
              if (mimeType === "audio/mpeg") {
                tryFormat("audio/wav");
              } else if (mimeType === "audio/wav") {
                // Try ogg as last resort
                tryFormat("audio/ogg");
              } else {
              }
            };

            formatAudio.play().catch((err) => {
              URL.revokeObjectURL(formatUrl);

              // Try next format when current fails to play
              if (mimeType === "audio/mpeg") {
                tryFormat("audio/wav");
              } else if (mimeType === "audio/wav") {
                tryFormat("audio/ogg");
              }
            });
          }
        }
      } catch (error) {
        resolve(); // Resolve instead of reject to continue with the conversation
      }
    });
  },

  // Helper method to play audio using WebAudio API with better format support
  playWithWebAudio: async function (audioBlob, resolve) {
    return new Promise(async (resolve, reject) => {
      try {
        // Debug: Check the first few bytes to verify it's a valid audio file
        // MP3 files typically start with ID3 (49 44 33) or MPEG frame sync (FF Ex)
        const arrayBuffer = await audioBlob.arrayBuffer();
        const byteView = new Uint8Array(arrayBuffer);
        const firstBytes = byteView.slice(0, 16);

        let byteString = Array.from(firstBytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ");

        // Check for valid MP3 signatures
        const isID3 =
          firstBytes[0] === 0x49 &&
          firstBytes[1] === 0x44 &&
          firstBytes[2] === 0x33;
        const isMPEGFrameSync =
          firstBytes[0] === 0xff && (firstBytes[1] & 0xe0) === 0xe0;

        if (!isID3 && !isMPEGFrameSync) {
        } else {
        }

        const AudioContextClass =
          window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
          return reject(new Error("AudioContext not supported"));
        }

        const context = new AudioContextClass();

        // Use the arrayBuffer we already loaded
        // Try to decode
        context.decodeAudioData(
          arrayBuffer,
          (buffer) => {
            // Get the actual duration of the audio
            const audioDuration = buffer.duration * 1000; // Convert to milliseconds

            const source = context.createBufferSource();
            source.buffer = buffer;
            source.connect(context.destination);

            source.onended = () => {
              context.close().catch(() => {});
              // Store the audio duration in a global variable for the redirect logic
              if (window.VoiceroVoice) {
                window.VoiceroVoice.lastAudioDuration = audioDuration;
              }
              resolve();
            };

            source.start(0);
          },
          (err) => {
            context.close().catch(() => {});
            reject(err);
          },
        );
      } catch (err) {
        reject(err);
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
        } catch (e) {}
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
      } catch (e) {}
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

  // Get past conversation context for AI
  getPastContext: function () {
    // Initialize context object
    const context = {
      messages: [],
    };

    // Check if we have a thread with messages
    if (
      window.VoiceroCore &&
      window.VoiceroCore.thread &&
      window.VoiceroCore.thread.messages &&
      window.VoiceroCore.thread.messages.length > 0
    ) {
      const messages = window.VoiceroCore.thread.messages;

      // Sort messages by creation time
      const sortedMessages = [...messages].sort((a, b) => {
        return new Date(a.createdAt) - new Date(b.createdAt);
      });

      // Get last 5 user questions and last 5 AI responses
      const userMessages = sortedMessages
        .filter((msg) => msg.role === "user")
        .slice(-5);

      const aiMessages = sortedMessages
        .filter((msg) => msg.role === "assistant")
        .slice(-5);

      // Combine all messages in chronological order
      const lastMessages = [...userMessages, ...aiMessages].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      );

      // Add each message to context
      lastMessages.forEach((msg) => {
        if (msg.role === "user") {
          context.messages.push({
            role: "user",
            content: msg.content,
            id: msg.id,
            createdAt: msg.createdAt,
          });
        } else if (msg.role === "assistant") {
          // For AI messages, try to extract the answer from JSON if needed
          let content = msg.content;
          try {
            const parsed = JSON.parse(content);
            if (parsed.answer) {
              content = parsed.answer;
            }
          } catch (e) {
            // Not JSON or couldn't parse, use as is
          }

          context.messages.push({
            role: "assistant",
            content: content,
            id: msg.id,
            createdAt: msg.createdAt,
          });
        }
      });
    } else {
      // If no thread exists, check if we have any local messages stored
      if (
        window.VoiceroCore &&
        window.VoiceroCore.appState &&
        window.VoiceroCore.appState.voiceMessages
      ) {
        const voiceMessages = window.VoiceroCore.appState.voiceMessages;

        // Add user message if available
        if (voiceMessages.user) {
          context.messages.push({
            role: "user",
            content: voiceMessages.user,
            createdAt: new Date().toISOString(),
          });
        }

        // Add AI message if available
        if (voiceMessages.ai) {
          context.messages.push({
            role: "assistant",
            content: voiceMessages.ai,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    // Console log past context to verify implementation
    console.log(
      "Voice Past Context (Last 5 messages from each role):",
      context,
    );

    return context;
  },

  // Handle redirection to extracted URLs
  redirectToUrl: function (url) {
    if (!url) return;

    try {
      // Ensure the URL is using https instead of http
      let secureUrl = url;

      // If it's a relative URL like "/", don't modify it
      if (url.indexOf("://") > 0) {
        // For absolute URLs, ensure we use https://
        secureUrl = url.replace(/^http:\/\//i, "https://");
      } else if (url.startsWith("www.")) {
        // If it starts with www but doesn't have a protocol, add https://
        secureUrl = "https://" + url;
      }

      // Validate the URL - for relative URLs, use the current location as the base
      if (secureUrl.startsWith("/") || !secureUrl.includes("://")) {
        // For relative URLs, use current origin as base
        new URL(secureUrl, window.location.origin);
        // Navigate to the relative URL directly
        window.location.href = secureUrl;
      } else {
        // For absolute URLs, validate and navigate
        new URL(secureUrl);
        window.location.href = secureUrl;
      }
    } catch (error) {
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
      background: #e5e5ea;
      border-radius: 18px;
      margin-bottom: 12px;
      width: fit-content;
      align-items: center;
      animation: fadeIn 0.3s ease forwards;
      margin-left: 5px;
    `;

    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("div");
      dot.style.cssText = `
        width: 7px;
        height: 7px;
        background: #999999;
        border-radius: 50%;
        animation: typingAnimation 1s infinite;
        animation-delay: ${i * 0.2}s;
      `;
      indicator.appendChild(dot);
    }

    const animStyle = document.createElement("style");
    animStyle.innerHTML = `
      @keyframes typingAnimation {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-6px); }
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
    let messagesContainer = document.getElementById("voice-messages");
    if (!messagesContainer) {
      this.createVoiceChatInterface();
      messagesContainer = document.getElementById("voice-messages");
      if (!messagesContainer) {
        const interfaceExists =
          document.getElementById("voice-chat-interface") !== null;
        if (interfaceExists) {
          const interfaceElement = document.getElementById(
            "voice-chat-interface",
          );
          interfaceElement.remove();
          this.createVoiceChatInterface();
          messagesContainer = document.getElementById("voice-messages");
          if (!messagesContainer) {
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

    const messageEl = document.createElement("div");
    messageEl.className = role === "user" ? "user-message" : "ai-message";

    // Generate a unique message ID for this message and store it as a data attribute
    const messageId =
      "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    messageEl.dataset.messageId = messageId;

    if (
      content === "Generating response..." ||
      content.includes("Thinking...") ||
      content === "..."
    ) {
      messageEl.className += " placeholder";
    }

    messageEl.style.cssText = `
      margin-bottom: 16px;
      animation: fadeIn 0.3s ease forwards;
      display: flex;
      justify-content: ${role === "user" ? "flex-end" : "flex-start"};
      position: relative;
      ${role === "user" ? "padding-right: 8px;" : "padding-left: 8px;"}
    `;

    let messageContent = document.createElement("div");
    messageContent.className = "message-content voice-message-content";

    if (formatMarkdown && role === "ai" && VoiceroCore) {
      messageContent.innerHTML = VoiceroCore.formatMarkdown(content);
    } else {
      messageContent.textContent = content;
    }

    if (role === "user") {
      messageContent.style.cssText = `
        background: var(--voicero-theme-color, ${this.websiteColor});
        color: white;
        border-radius: 18px;
        padding: 12px 16px;
        max-width: 70%;
        word-wrap: break-word;
        font-size: 14px;
        line-height: 1.4;
        text-align: left;
        box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05);
        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      `;

      // Add delivery status for user messages (iPhone-style)
      const statusDiv = document.createElement("div");
      statusDiv.className = "read-status";
      statusDiv.textContent = "Delivered";
      messageEl.appendChild(statusDiv);
    } else if (role === "ai") {
      if (
        content === "Generating response..." ||
        content.includes("Thinking...") ||
        content === "..."
      ) {
        messageContent.style.cssText = `
          background: #e5e5ea;
          color: #666;
          border-radius: 18px;
          padding: 12px 16px;
          max-width: 70%;
          word-wrap: break-word;
          font-size: 14px;
          line-height: 1.4;
          font-style: italic;
          text-align: left;
          box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05);
          font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
        `;
      } else {
        messageContent.style.cssText = `
          background: #e5e5ea;
          color: #333;
          border-radius: 18px;
          padding: 12px 16px;
          max-width: 70%;
          word-wrap: break-word;
          font-size: 14px;
          line-height: 1.4;
          text-align: left;
          box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05);
          font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
        `;

        // Update all previous user message statuses to "Read" after AI responds
        const userStatusDivs =
          messagesContainer.querySelectorAll(".read-status");
        userStatusDivs.forEach((div) => {
          div.textContent = "Read";
          div.style.color =
            "var(--voicero-theme-color, " + this.websiteColor + ")";
        });
      }
    }

    messageEl.appendChild(messageContent);
    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // If this is an AI message (not a placeholder), attach the "Report AI response" button using VoiceroSupport
    if (
      role === "ai" &&
      content !== "Generating response..." &&
      !content.includes("Thinking...") &&
      content !== "..." &&
      window.VoiceroSupport &&
      typeof window.VoiceroSupport.attachReportButtonToMessage === "function"
    ) {
      try {
        // Small delay to ensure the message is fully rendered
        setTimeout(() => {
          window.VoiceroSupport.attachReportButtonToMessage(messageEl, "voice");
        }, 50);
      } catch (e) {
        console.error("Failed to attach report button to voice message:", e);
      }
    }

    return messageEl;
  },

  // Format currency values for better speech pronunciation
  formatCurrencyForSpeech: function (text) {
    // Check if text is a string first
    if (typeof text !== "string") {
      // Convert to string safely
      return String(text || "");
    }

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
    console.log("VoiceroVoice: Reopening voice chat from minimized state");

    // Set temporary flags to manage state
    const wasOpeningBefore = this.isOpeningVoiceChat;
    this.isOpeningVoiceChat = true;
    this.isClosingVoiceChat = false;

    // First create reliable references to all elements we need
    const voiceInterface = document.getElementById("voice-chat-interface");
    const messagesContainer = document.getElementById("voice-messages");
    const headerContainer = document.getElementById("voice-controls-header");
    const inputWrapper = document.getElementById("voice-input-wrapper");
    const maximizeButton = document.getElementById("maximize-voice-chat");

    // Update window state first - critical for proper state management
    if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
      window.VoiceroCore.updateWindowState({
        voiceOpen: true,
        voiceOpenWindowUp: true,
        coreOpen: false,
        textOpen: false,
        textOpenWindowUp: false,
      });
    }

    if (voiceInterface) {
      // Restore messages container
      if (messagesContainer) {
        // Show all messages
        const allMessages = messagesContainer.querySelectorAll(
          ".user-message, .ai-message",
        );
        allMessages.forEach((msg) => {
          msg.style.display = "flex";
        });

        // Restore container styles with robust inline styling
        messagesContainer.style.cssText = `
          max-height: 35vh !important;
          min-height: auto !important;
          height: auto !important;
          opacity: 1 !important;
          padding: 15px !important;
          padding-top: 0 !important;
          overflow: auto !important;
          border: none !important;
          display: block !important;
          visibility: visible !important;
        `;

        // Check if we should show a welcome message
        const existingMessages = messagesContainer.querySelectorAll(
          ".user-message .message-content, .ai-message .message-content",
        );

        // MODIFIED: Always show welcome if no messages, otherwise use session preference
        let shouldShowWelcome = existingMessages.length === 0;

        // If we have a session with voiceWelcome defined AND there are messages, use that value instead
        if (
          existingMessages.length > 0 &&
          window.VoiceroCore &&
          window.VoiceroCore.session &&
          typeof window.VoiceroCore.session.voiceWelcome !== "undefined"
        ) {
          shouldShowWelcome = window.VoiceroCore.session.voiceWelcome;
        }

        if (shouldShowWelcome && existingMessages.length === 0) {
          // Check if a welcome message already exists
          const existingWelcomeMessage =
            messagesContainer.querySelector(".welcome-message");

          // Only add a welcome message if one doesn't already exist
          if (!existingWelcomeMessage) {
            // Add welcome message
            this.addSystemMessage(`
              <div class="welcome-message" style="width: 90% !important; max-width: 400px !important; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08) !important; background: linear-gradient(135deg, #f5f7fa 0%, #e6e9f0 100%) !important; border: none !important; padding: 20px 15px !important; margin: 15px auto !important;">
                <div class="welcome-title" style="background: linear-gradient(90deg, var(--voicero-theme-color, ${this.websiteColor}), var(--voicero-theme-color, ${this.websiteColor})) text; -webkit-text-fill-color: transparent; margin-bottom: 5px; font-size: 18px;">Aura, your website concierge</div>
                <div class="welcome-subtitle" style="margin-bottom: 3px; font-size: 14px;">Click mic & <span class="welcome-highlight" style="color: var(--voicero-theme-color, ${this.websiteColor});">start talking</span></div>
                <div class="welcome-note" style="margin-top: 5px; font-size: 12px;"><span class="welcome-pulse" style="background-color: var(--voicero-theme-color, ${this.websiteColor}); width: 8px; height: 8px;"></span>Button glows during conversation</div>
              </div>
            `);

            // Add console log to verify welcome message height
            console.log("Voice welcome message created. Checking height:");
            setTimeout(() => {
              const welcomeMsg = document.querySelector(
                "#voice-messages .welcome-message",
              );
              if (welcomeMsg) {
                console.log("Welcome message height:", welcomeMsg.offsetHeight);
                console.log(
                  "Welcome message computed style:",
                  getComputedStyle(welcomeMsg).height,
                );

                // Force height if needed
                if (welcomeMsg.offsetHeight < 100) {
                  welcomeMsg.style.setProperty("height", "100px", "important");
                  welcomeMsg.style.setProperty(
                    "min-height",
                    "100px",
                    "important",
                  );
                  console.log("Forced welcome message height to 100px");
                }
              } else {
                console.log("Welcome message not found in DOM");
              }
            }, 100);
          }
        }
      }

      // Restore header with robust inline styling
      if (headerContainer) {
        headerContainer.style.cssText = `
          position: sticky !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          height: 40px !important;
          background-color: #f2f2f7 !important;
          z-index: 9999999 !important;
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          padding: 10px 15px !important;
          border-bottom: 1px solid rgba(0, 0, 0, 0.1) !important;
          border-radius: 0 !important;
          margin: 0 !important;
          margin-bottom: 15px !important;
          width: 100% !important;
          box-shadow: none !important;
          box-sizing: border-box !important;
          margin-left: 0 !important; 
          margin-right: 0 !important;
        `;
      }

      // Restore input wrapper with robust inline styling
      if (inputWrapper) {
        inputWrapper.style.cssText = `
          position: relative;
          padding: 2px;
          background: linear-gradient(90deg, 
            ${this.adjustColor(
              `var(--voicero-theme-color, ${this.websiteColor || "#882be6"})`,
              -0.4,
            )}, 
            ${this.adjustColor(
              `var(--voicero-theme-color, ${this.websiteColor || "#882be6"})`,
              -0.2,
            )}, 
            var(--voicero-theme-color, ${this.websiteColor || "#882be6"}),
            ${this.adjustColor(
              `var(--voicero-theme-color, ${this.websiteColor || "#882be6"})`,
              0.2,
            )}, 
            ${this.adjustColor(
              `var(--voicero-theme-color, ${this.websiteColor || "#882be6"})`,
              0.4,
            )}
          );
          background-size: 500% 100%;
          border-radius: 0 0 12px 12px;
          animation: gradientBorder 15s linear infinite;
          transition: all 0.3s ease;
          box-shadow: none;
          width: 100%;
          box-sizing: border-box;
          margin: 0;
        `;
      }

      // Hide maximize button
      if (maximizeButton) {
        maximizeButton.style.display = "none";
      }

      // Update main interface with robust inline styling
      voiceInterface.style.cssText = `
        position: fixed !important;
        left: 50% !important;
        bottom: 20px !important;
        transform: translateX(-50%) !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        z-index: 999999 !important;
        width: 85% !important;
        max-width: 480px !important;
        min-width: 280px !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        border-radius: 12px 12px 0 0 !important;
      `;
    }

    // Reset opening flag with delay
    setTimeout(() => {
      // Restore original opening flag state or reset to false
      this.isOpeningVoiceChat = wasOpeningBefore || false;
      console.log(
        "VoiceroVoice: Reopening complete, isOpeningVoiceChat =",
        this.isOpeningVoiceChat,
      );
    }, 1000);
  },

  // Speak welcome message using TTS
  speakWelcomeMessage: async function (welcomeText) {
    // We're not going to attempt to play audio automatically since browsers will block it
    // The user will need to interact with the page first (like clicking the mic button)
    // Display the welcome message as text only
    if (welcomeText) {
      this.addMessage(welcomeText, "ai");
    }
    return;
  },

  // Add a system message to the voice interface
  addSystemMessage: function (text) {
    const messagesContainer = document.getElementById("voice-messages");
    if (!messagesContainer) return;

    // Create a message element
    const messageDiv = document.createElement("div");
    messageDiv.className = "ai-message";
    messageDiv.style.cssText = `
      display: flex;
      justify-content: center;
      margin-bottom: 8px;
    `;

    // Create the message content
    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";
    contentDiv.innerHTML = text;
    contentDiv.style.cssText = `      background: #e5e5ea;
      color: #333;
      border-radius: 16px;
      padding: 6px 10px;
      width: 90% !important;
      max-width: 400px !important;
      word-wrap: break-word;
      font-size: 13px;
      line-height: 1.2;
      text-align: center;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
      margin: 4px auto;
    `;

    // Add content to message
    messageDiv.appendChild(contentDiv);

    // Add message to container
    messagesContainer.appendChild(messageDiv);

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  },

  // Clear chat history from the voice interface
  clearChatHistory: function () {
    // Call the session/clear API endpoint
    if (window.VoiceroCore && window.VoiceroCore.sessionId) {
      const proxyUrl = "https://www.voicero.ai/api/session/clear";

      fetch(proxyUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(window.voiceroConfig?.getAuthHeaders
            ? window.voiceroConfig.getAuthHeaders()
            : {}),
        },
        body: JSON.stringify({
          sessionId: window.VoiceroCore.sessionId,
        }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Session clear failed: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          // Update the session and thread in VoiceroCore
          if (data.session) {
            if (window.VoiceroCore) {
              window.VoiceroCore.session = data.session;

              // Set the new thread (should be the first one in the array)
              if (data.session.threads && data.session.threads.length > 0) {
                // Get the most recent thread (first in the array since it's sorted by lastMessageAt desc)
                window.VoiceroCore.thread = data.session.threads[0];
                window.VoiceroCore.currentThreadId =
                  data.session.threads[0].threadId;

                // IMPORTANT: Also update the currentThreadId in this component
                // to ensure new requests use the new thread
                this.currentThreadId = data.session.threads[0].threadId;
              }
            }
          }
        })
        .catch((error) => {
          // console.error("Failed to clear chat history:", error);
        });
    }

    const messagesContainer = document.getElementById("voice-messages");
    if (!messagesContainer) return;

    // Remove all message elements except the user message input container
    const messages = messagesContainer.querySelectorAll(
      ".ai-message, .user-message",
    );
    if (messages.length === 0) return;

    messages.forEach((msg) => {
      // If this is the first user-message and it's empty (just the container), keep it
      if (
        msg.classList.contains("user-message") &&
        !msg.querySelector(".message-content")
      ) {
        return;
      }
      msg.remove();
    });

    // Reset the messages array as well
    this.messages = [];

    // Add welcome message again with the exact same format as in openVoiceChat
    this.addSystemMessage(`
      <div class="welcome-message" style="width: 90% !important; max-width: 400px !important; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08) !important; background: linear-gradient(135deg, #f5f7fa 0%, #e6e9f0 100%) !important; border: none !important; padding: 20px 15px !important; margin: 15px auto !important;">
        <div class="welcome-title" style="background: linear-gradient(90deg, var(--voicero-theme-color, ${this.websiteColor}), var(--voicero-theme-color, ${this.websiteColor})) text; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;">Aura, your website concierge</div>
        <div class="welcome-subtitle">Click mic & <span class="welcome-highlight" style="color: var(--voicero-theme-color, ${this.websiteColor});">start talking</span></div>
        <div class="welcome-note"><span class="welcome-pulse" style="background-color: var(--voicero-theme-color, ${this.websiteColor});"></span>Button glows during conversation</div>
      </div>
    `);

    // Force welcome message heights
    setTimeout(() => this.forceWelcomeMessageHeight(), 100);
  },

  // Stop any ongoing recording
  stopRecording: function (processAudioData = true) {
    // Set flag to indicate recording is stopped
    this.isRecording = false;
    this.manuallyStoppedRecording = !processAudioData;

    // Stop any audio streams that might be active
    if (this.currentAudioStream) {
      this.currentAudioStream.getTracks().forEach((track) => track.stop());
      this.currentAudioStream = null;
    }

    // Stop the media recorder if it exists
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.stop();
    }

    // Clear any timers
    if (this.silenceDetectionTimer) {
      clearInterval(this.silenceDetectionTimer);
      this.silenceDetectionTimer = null;
    }

    if (this.recordingTimeout) {
      clearTimeout(this.recordingTimeout);
      this.recordingTimeout = null;
    }

    // Reset audio related variables
    this.audioContext = null;
    this.analyser = null;
    this.audioChunks = [];
    this.silenceTime = 0;
    this.isSpeaking = false;
    this.hasStartedSpeaking = false;
  },

  // Load messages from session
  loadMessagesFromSession: function () {
    // Flag to track if any messages were loaded
    let messagesLoaded = false;

    // Check if we have a session with threads
    if (
      window.VoiceroCore &&
      window.VoiceroCore.session &&
      window.VoiceroCore.session.threads &&
      window.VoiceroCore.session.threads.length > 0
    ) {
      // Find the most recent thread by sorting the threads by lastMessageAt or createdAt
      const threads = [...window.VoiceroCore.session.threads];
      const sortedThreads = threads.sort((a, b) => {
        // First try to sort by lastMessageAt if available
        if (a.lastMessageAt && b.lastMessageAt) {
          return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
        }
        // Fall back to createdAt if lastMessageAt is not available
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

      // Use the most recent thread (first after sorting)
      const currentThread = sortedThreads[0];

      if (
        currentThread &&
        currentThread.messages &&
        currentThread.messages.length > 0
      ) {
        // Sort messages by createdAt (oldest first)
        const sortedMessages = [...currentThread.messages].sort((a, b) => {
          return new Date(a.createdAt) - new Date(b.createdAt);
        });

        // Clear existing messages if any
        const messagesContainer = document.getElementById("voice-messages");
        if (messagesContainer) {
          // Keep the container but remove messages (except welcome message)
          const messages = messagesContainer.querySelectorAll(
            ".user-message, .ai-message",
          );
          messages.forEach((msg) => {
            // Preserve welcome message if it exists
            if (!msg.querySelector(".welcome-message")) {
              msg.remove();
            }
          });
        }

        // Add each message to the UI
        sortedMessages.forEach((msg) => {
          if (msg.role === "user") {
            // Add user message
            this.addMessage(msg.content, "user");
            messagesLoaded = true;
          } else if (msg.role === "assistant") {
            try {
              // Parse the content which is a JSON string
              let content = msg.content;
              let aiMessage = "";

              try {
                // Try to parse as JSON
                const parsedContent = JSON.parse(content);
                if (parsedContent.answer) {
                  aiMessage = parsedContent.answer;
                }
              } catch (e) {
                // If parsing fails, use the raw content

                aiMessage = content;
              }

              // Add AI message
              this.addMessage(aiMessage, "ai");
              messagesLoaded = true;
            } catch (e) {}
          }
        });

        // Store the thread ID
        this.currentThreadId = currentThread.threadId;

        // Scroll to bottom
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      } else {
        // Still store the thread ID even if no messages
        this.currentThreadId = currentThread.threadId;
      }
    }

    // If no messages were loaded, add welcome message
    if (!messagesLoaded) {
      const messagesContainer = document.getElementById("voice-messages");
      if (messagesContainer) {
        // Check if a welcome message already exists
        const existingWelcomeMessage =
          messagesContainer.querySelector(".welcome-message");

        // Only add a welcome message if one doesn't already exist
        if (!existingWelcomeMessage) {
          // Add welcome message with clear prompt
          this.addSystemMessage(`
            <div class="welcome-message" style="width: 90% !important; max-width: 400px !important; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08) !important; background: linear-gradient(135deg, #f5f7fa 0%, #e6e9f0 100%) !important; border: none !important; padding: 20px 15px !important; margin: 15px auto !important;">
              <div class="welcome-title" style="background: linear-gradient(90deg, var(--voicero-theme-color, ${this.websiteColor}), var(--voicero-theme-color, ${this.websiteColor})) text; -webkit-text-fill-color: transparent; margin-bottom: 5px; font-size: 18px;">Aura, your website concierge</div>
              <div class="welcome-subtitle" style="margin-bottom: 3px; font-size: 14px;">Click mic & <span class="welcome-highlight" style="color: var(--voicero-theme-color, ${this.websiteColor});">start talking</span></div>
              <div class="welcome-note" style="margin-top: 5px; font-size: 12px;"><span class="welcome-pulse" style="background-color: var(--voicero-theme-color, ${this.websiteColor}); width: 8px; height: 8px;"></span>Button glows during conversation</div>
            </div>
          `);

          // Force welcome message heights
          setTimeout(() => this.forceWelcomeMessageHeight(), 100);

          // Update window state to show welcome
          if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
            window.VoiceroCore.updateWindowState({
              voiceWelcome: true,
            });
          }
        }
      }
    }
  },

  // Helper methods for color variations
  adjustColor: function (color, adjustment) {
    if (!color) return "#ff4444";
    if (!color.startsWith("#")) return color;

    try {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);

      // Positive adjustment makes it lighter, negative makes it darker
      let factor = adjustment < 0 ? 1 + adjustment : 1 + adjustment;

      // Adjust RGB values
      let newR =
        adjustment < 0
          ? Math.floor(r * factor)
          : Math.min(255, Math.floor(r * factor));
      let newG =
        adjustment < 0
          ? Math.floor(g * factor)
          : Math.min(255, Math.floor(g * factor));
      let newB =
        adjustment < 0
          ? Math.floor(b * factor)
          : Math.min(255, Math.floor(b * factor));

      // Convert back to hex
      return `#${newR.toString(16).padStart(2, "0")}${newG
        .toString(16)
        .padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
    } catch (e) {
      return color;
    }
  },

  // Collect page data for better context
  collectPageData: function () {
    const pageData = {
      url: window.location.href,
      full_text: document.body.innerText.trim(),
      buttons: [],
      forms: [],
      sections: [],
      images: [],
    };

    // Only include elements that are within the body and not the header
    const isInHeader = (element) => {
      let parent = element.parentElement;
      while (parent) {
        if (parent.tagName && parent.tagName.toLowerCase() === "header") {
          return true;
        }
        parent = parent.parentElement;
      }
      return false;
    };

    // Check if element is in footer
    const isInFooter = (element) => {
      let parent = element.parentElement;
      while (parent) {
        if (
          parent.tagName &&
          (parent.tagName.toLowerCase() === "footer" ||
            parent.id === "colophon" ||
            parent.id === "ast-scroll-top")
        ) {
          return true;
        }
        parent = parent.parentElement;
      }
      return false;
    };

    // Filter function to exclude unwanted elements
    const shouldExcludeElement = (element) => {
      if (!element) return false;

      // Skip elements without IDs that are in header, footer, or admin bars
      if (!element.id) {
        if (isInHeader(element) || isInFooter(element)) {
          return true;
        }
        return false;
      }

      const id = element.id.toLowerCase();

      // Specific button IDs to exclude
      if (id === "chat-website-button" || id === "voice-mic-button") {
        return true;
      }

      // Exclude common WordPress admin elements
      if (id === "wpadminbar" || id === "adminbarsearch" || id === "page") {
        return true;
      }

      // Exclude masthead
      if (id === "masthead" || id.includes("masthead")) {
        return true;
      }

      // Exclude elements with ids starting with wp- or voicero
      if (id.startsWith("wp-") || id.startsWith("voicero")) {
        return true;
      }

      // Exclude voice toggle container
      if (id === "voice-toggle-container") {
        return true;
      }

      // Exclude elements related to voice-chat or text-chat
      if (id.includes("voice-") || id.includes("text-chat")) {
        return true;
      }

      return false;
    };

    // Collect all buttons that meet our criteria
    const buttonElements = document.querySelectorAll("button");
    buttonElements.forEach((button) => {
      if (
        !isInHeader(button) &&
        !isInFooter(button) &&
        !shouldExcludeElement(button)
      ) {
        pageData.buttons.push({
          id: button.id || "",
          text: button.innerText.trim(),
        });
      }
    });

    // Collect all forms and their inputs/selects that meet our criteria
    const formElements = document.querySelectorAll("form");
    formElements.forEach((form) => {
      if (
        !isInHeader(form) &&
        !isInFooter(form) &&
        !shouldExcludeElement(form)
      ) {
        const formData = {
          id: form.id || "",
          inputs: [],
          selects: [],
        };

        // Get inputs
        const inputs = form.querySelectorAll("input");
        inputs.forEach((input) => {
          formData.inputs.push({
            name: input.name || "",
            type: input.type || "",
            value: input.value || "",
          });
        });

        // Get selects
        const selects = form.querySelectorAll("select");
        selects.forEach((select) => {
          const selectData = {
            name: select.name || "",
            options: [],
          };

          // Get options
          const options = select.querySelectorAll("option");
          options.forEach((option) => {
            selectData.options.push({
              value: option.value || "",
              text: option.innerText.trim(),
            });
          });

          formData.selects.push(selectData);
        });

        pageData.forms.push(formData);
      }
    });

    // Collect important sections that meet our criteria
    const sectionElements = document.querySelectorAll(
      "div[id], section, article, main, aside",
    );
    sectionElements.forEach((section) => {
      if (
        !isInHeader(section) &&
        !isInFooter(section) &&
        !shouldExcludeElement(section)
      ) {
        pageData.sections.push({
          id: section.id || "",
          tag: section.tagName.toLowerCase(),
          text_snippet: section.innerText.substring(0, 150).trim(), // First 150 chars
        });
      }
    });

    // Collect images that meet our criteria
    const imageElements = document.querySelectorAll("img");
    imageElements.forEach((img) => {
      if (!isInHeader(img) && !isInFooter(img) && !shouldExcludeElement(img)) {
        pageData.images.push({
          src: img.src || "",
          alt: img.alt || "",
        });
      }
    });

    return pageData;
  },

  // Toggle from voice chat to text chat
  toggleToTextChat: function () {
    console.log("VoiceroVoice: Toggling from voice to text chat");

    // First close the voice chat interface
    this.closeVoiceChat();

    // Update window state to ensure text chat will be maximized
    if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
      window.VoiceroCore.updateWindowState({
        textOpen: true,
        textOpenWindowUp: true, // Explicitly set to true to ensure maximized
        voiceOpen: false,
        voiceOpenWindowUp: false,
        coreOpen: false,
      });
    }

    // Then open the text chat interface
    if (window.VoiceroText && window.VoiceroText.openTextChat) {
      setTimeout(() => {
        window.VoiceroText.openTextChat();

        // Make sure it's maximized
        if (window.VoiceroText.maximizeChat) {
          setTimeout(() => {
            window.VoiceroText.maximizeChat();
          }, 100);
        }
      }, 100);
    }
  },

  // Force welcome message styling to match text interface
  forceWelcomeMessageHeight: function () {
    console.log("---------- WELCOME MESSAGE STYLING DEBUG ----------");
    console.log("Applying welcome message styling");

    // Find all welcome messages in the DOM
    const welcomeMessages = document.querySelectorAll(".welcome-message");
    console.log(`Found ${welcomeMessages.length} welcome messages in the DOM`);

    welcomeMessages.forEach((msg, index) => {
      const computedStyle = window.getComputedStyle(msg);
      console.log(`Welcome Message ${index + 1} BEFORE styling:`, {
        height: computedStyle.height,
        minHeight: computedStyle.minHeight,
        display: computedStyle.display,
        flexDirection: computedStyle.flexDirection,
        justifyContent: computedStyle.justifyContent,
        padding: computedStyle.padding,
        margin: computedStyle.margin,
        width: computedStyle.width,
        maxWidth: computedStyle.maxWidth,
        boxShadow: computedStyle.boxShadow,
        background: computedStyle.background,
        border: computedStyle.border,
        inlineStyle: msg.getAttribute("style"),
      });
    });

    welcomeMessages.forEach((msg, index) => {
      // Apply styling that matches the text interface
      // Remove height constraints and flex layout
      msg.style.removeProperty("height");
      msg.style.removeProperty("min-height");
      msg.style.removeProperty("display");
      msg.style.removeProperty("flex-direction");
      msg.style.removeProperty("justify-content");

      // Set padding and margin to match text interface
      msg.style.setProperty("width", "90%", "important");
      msg.style.setProperty("max-width", "400px", "important");
      msg.style.setProperty(
        "box-shadow",
        "0 4px 15px rgba(0, 0, 0, 0.08)",
        "important",
      );
      msg.style.setProperty(
        "background",
        "linear-gradient(135deg, #f5f7fa 0%, #e6e9f0 100%)",
        "important",
      );
      msg.style.setProperty("border", "none", "important");

      msg.style.setProperty("padding", "20px 15px", "important");
      msg.style.setProperty("margin", "15px auto", "important");

      // Log the computed style after our changes
      const computedStyle = window.getComputedStyle(msg);
      console.log(`Welcome Message ${index + 1} AFTER styling:`, {
        height: computedStyle.height,
        minHeight: computedStyle.minHeight,
        display: computedStyle.display,
        flexDirection: computedStyle.flexDirection,
        justifyContent: computedStyle.justifyContent,
        padding: computedStyle.padding,
        margin: computedStyle.margin,
        width: computedStyle.width,
        maxWidth: computedStyle.maxWidth,
        boxShadow: computedStyle.boxShadow,
        background: computedStyle.background,
        border: computedStyle.border,
        inlineStyle: msg.getAttribute("style"),
      });
    });

    // Also fix shadow DOM elements if they exist
    if (document.getElementById("voicero-text-chat-container")?.shadowRoot) {
      const shadowWelcomeMessages = document
        .getElementById("voicero-text-chat-container")
        .shadowRoot.querySelectorAll(".welcome-message");
      console.log(
        `Found ${shadowWelcomeMessages.length} welcome messages in shadow DOM`,
      );

      shadowWelcomeMessages.forEach((msg, index) => {
        const computedStyle = window.getComputedStyle(msg);
        console.log(`Shadow DOM Welcome Message ${index + 1} BEFORE styling:`, {
          height: computedStyle.height,
          minHeight: computedStyle.minHeight,
          display: computedStyle.display,
          flexDirection: computedStyle.flexDirection,
          justifyContent: computedStyle.justifyContent,
          padding: computedStyle.padding,
          margin: computedStyle.margin,
          inlineStyle: msg.getAttribute("style"),
        });

        // Remove height constraints and flex layout
        msg.style.removeProperty("height");
        msg.style.removeProperty("min-height");
        msg.style.removeProperty("display");
        msg.style.removeProperty("flex-direction");
        msg.style.removeProperty("justify-content");

        msg.style.setProperty("padding", "20px 15px", "important");
        msg.style.setProperty("margin", "15px auto", "important");

        // Log after styling
        const afterStyle = window.getComputedStyle(msg);
        console.log(`Shadow DOM Welcome Message ${index + 1} AFTER styling:`, {
          height: afterStyle.height,
          minHeight: afterStyle.minHeight,
          display: afterStyle.display,
          flexDirection: afterStyle.flexDirection,
          justifyContent: afterStyle.justifyContent,
          padding: afterStyle.padding,
          margin: afterStyle.margin,
          inlineStyle: msg.getAttribute("style"),
        });
      });
    }

    console.log("------------------------------------------");
    return true;
  },

  // Set up observer to force welcome message heights
  setupWelcomeMessageObserver: function () {
    console.log("Setting up welcome message observer");

    // Create a MutationObserver to watch for changes to the DOM
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          // Check if any of the added nodes are welcome messages or contain welcome messages
          let hasWelcomeMessage = false;

          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              // Element node
              if (
                node.classList &&
                node.classList.contains("welcome-message")
              ) {
                hasWelcomeMessage = true;
              } else if (
                node.querySelector &&
                node.querySelector(".welcome-message")
              ) {
                hasWelcomeMessage = true;
              }
            }
          });

          if (hasWelcomeMessage) {
            console.log(
              "Welcome message detected in DOM changes, forcing height",
            );
            this.forceWelcomeMessageHeight();
          }
        }
      }
    });

    // Start observing the document body
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Store the observer for potential cleanup later
    this.welcomeMessageObserver = observer;

    return true;
  },

  // Sync theme color with VoiceroCore
  syncThemeColor: function () {
    let newColor = null;

    // Check for color in VoiceroCore
    if (window.VoiceroCore) {
      if (window.VoiceroCore.websiteColor) {
        newColor = window.VoiceroCore.websiteColor;
      } else if (
        window.VoiceroCore.session &&
        window.VoiceroCore.session.website &&
        window.VoiceroCore.session.website.color
      ) {
        newColor = window.VoiceroCore.session.website.color;
      }
    }

    // Only update if we got a color and it's different from the current one
    if (newColor && newColor !== this.websiteColor) {
      console.log(
        "VoiceroVoice: Updating theme color from",
        this.websiteColor,
        "to",
        newColor,
      );
      this.websiteColor = newColor;

      // Update CSS variable
      document.documentElement.style.setProperty(
        "--voicero-theme-color",
        this.websiteColor,
      );

      // Update mic button if it exists
      const micButton = document.getElementById("voice-mic-button");
      if (micButton && !this.isRecording) {
        micButton.style.background = this.websiteColor;
      }

      // Update any user messages
      const userMessages = document.querySelectorAll(
        ".user-message .message-content",
      );
      userMessages.forEach((msg) => {
        msg.style.background =
          "var(--voicero-theme-color, " + this.websiteColor + ")";
      });

      // Update read status indicators
      const readStatuses = document.querySelectorAll(".read-status");
      readStatuses.forEach((status) => {
        if (status.textContent === "Read") {
          status.style.color =
            "var(--voicero-theme-color, " + this.websiteColor + ")";
        }
      });
    }
  },
};

// Expose global functions
window.VoiceroVoice = VoiceroVoice;

// Add debugging helper function
VoiceroVoice.debugInterface = function () {
  console.log("---------- VOICE INTERFACE DEBUG ----------");

  // Check flags
  console.log("Flags:", {
    isRecording: this.isRecording,
    isOpeningVoiceChat: this.isOpeningVoiceChat,
    isClosingVoiceChat: this.isClosingVoiceChat,
    lastOpenTime: this.lastOpenTime,
    timeSinceOpen: Date.now() - this.lastOpenTime + "ms",
  });

  // Check elements
  const voiceInterface = document.getElementById("voice-chat-interface");
  const toggleContainer = document.getElementById("voice-toggle-container");
  const mainButton = document.getElementById("chat-website-button");
  const messagesContainer = document.getElementById("voice-messages");

  console.log("Elements:", {
    voiceInterface: voiceInterface ? "exists" : "missing",
    toggleContainer: toggleContainer ? "exists" : "missing",
    mainButton: mainButton ? "exists" : "missing",
    messagesContainer: messagesContainer ? "exists" : "missing",
  });

  // Check visibility
  if (voiceInterface) {
    const style = window.getComputedStyle(voiceInterface);
    console.log("Voice Interface Visibility:", {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      zIndex: style.zIndex,
    });
  }

  if (mainButton) {
    const style = window.getComputedStyle(mainButton);
    console.log("Main Button Visibility:", {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      zIndex: style.zIndex,
    });
  }

  // Check VoiceroCore state
  if (window.VoiceroCore && window.VoiceroCore.session) {
    console.log("VoiceroCore Session:", {
      voiceOpen: window.VoiceroCore.session.voiceOpen,
      voiceOpenWindowUp: window.VoiceroCore.session.voiceOpenWindowUp,
      textOpen: window.VoiceroCore.session.textOpen,
    });
  } else {
    console.log("VoiceroCore Session: Not available");
  }

  console.log("---------- WELCOME MESSAGE DEBUG ----------");
  const welcomeMessages = document.querySelectorAll(".welcome-message");
  console.log(`Found ${welcomeMessages.length} welcome messages in the DOM`);

  welcomeMessages.forEach((msg, index) => {
    const computedStyle = window.getComputedStyle(msg);
    console.log(`Welcome Message ${index + 1}:`, {
      height: computedStyle.height,
      minHeight: computedStyle.minHeight,
      display: computedStyle.display,
      flexDirection: computedStyle.flexDirection,
      justifyContent: computedStyle.justifyContent,
      padding: computedStyle.padding,
      margin: computedStyle.margin,
      width: computedStyle.width,
      maxWidth: computedStyle.maxWidth,
      boxShadow: computedStyle.boxShadow,
      background: computedStyle.background,
      border: computedStyle.border,
      innerHTML: msg.innerHTML,
      outerHTML: msg.outerHTML,
    });
  });

  // Check if there are any inline styles
  welcomeMessages.forEach((msg, index) => {
    console.log(
      `Welcome Message ${index + 1} inline styles:`,
      msg.getAttribute("style"),
    );
  });

  console.log("------------------------------------------");

  return "Debug info logged to console";
};

// Add autoMic activation function
VoiceroVoice.activateAutoMic = function () {
  // Only proceed if the voice interface is open
  const voiceInterface = document.getElementById("voice-chat-interface");
  if (!voiceInterface || voiceInterface.style.display !== "block") {
    return;
  }

  // If not already recording, start the microphone
  if (!this.isRecording) {
    this.toggleMic("auto");

    // Begin audio processing immediately
    if (this.mediaRecorder && this.audioContext && this.analyser) {
      // Force hasStartedSpeaking to true to ensure we're immediately listening
      this.hasStartedSpeaking = true;
      this.isSpeaking = true;
    } else {
    }
  } else {
  }
};

// Initialize when core is ready
document.addEventListener("DOMContentLoaded", () => {
  const existingInterface = document.getElementById("voice-chat-interface");
  if (existingInterface) {
    existingInterface.remove();
  }

  if (typeof VoiceroCore !== "undefined") {
    VoiceroVoice.init();

    // Initialize the hasShownVoiceWelcome flag if it doesn't exist
    if (
      VoiceroCore &&
      VoiceroCore.appState &&
      VoiceroCore.appState.hasShownVoiceWelcome === undefined
    ) {
      VoiceroCore.appState.hasShownVoiceWelcome = false;
      VoiceroCore.saveState();
    }

    // Check for voice reactivation after navigation
    const shouldReactivate =
      localStorage.getItem("voicero_reactivate_voice") === "true" ||
      (VoiceroCore.appState &&
        VoiceroCore.appState.isOpen &&
        VoiceroCore.appState.activeInterface === "voice");

    if (shouldReactivate) {
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
          localStorage.getItem("voicero_auto_mic") === "true" ||
          (VoiceroCore &&
            VoiceroCore.session &&
            VoiceroCore.session.autoMic === true);

        if (shouldActivateMic) {
          localStorage.removeItem("voicero_auto_mic");
          setTimeout(() => {
            // Use our new function for complete mic activation
            VoiceroVoice.activateAutoMic();
          }, 800);
        }
      }, 1000);
    }
  } else {
    let attempts = 0;
    const checkCoreInterval = setInterval(() => {
      attempts++;
      if (typeof VoiceroCore !== "undefined") {
        clearInterval(checkCoreInterval);
        VoiceroVoice.init();

        // Initialize the hasShownVoiceWelcome flag if it doesn't exist
        if (
          VoiceroCore &&
          VoiceroCore.appState &&
          VoiceroCore.appState.hasShownVoiceWelcome === undefined
        ) {
          VoiceroCore.appState.hasShownVoiceWelcome = false;
          VoiceroCore.saveState();
        }

        // Check for voice reactivation after VoiceroCore loads
        const shouldReactivate =
          localStorage.getItem("voicero_reactivate_voice") === "true" ||
          (VoiceroCore.appState &&
            VoiceroCore.appState.isOpen &&
            VoiceroCore.appState.activeInterface === "voice");
        if (shouldReactivate) {
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
              localStorage.getItem("voicero_auto_mic") === "true" ||
              (VoiceroCore &&
                VoiceroCore.session &&
                VoiceroCore.session.autoMic === true);

            if (shouldActivateMic) {
              localStorage.removeItem("voicero_auto_mic");
              setTimeout(() => {
                // Use our new function for complete mic activation
                VoiceroVoice.activateAutoMic();
              }, 800);
            }
          }, 1000);
        }
      } else if (attempts >= 50) {
        clearInterval(checkCoreInterval);
      }
    }, 100);
  }
});

// Initialize welcome message heights on document load
if (
  document.readyState === "complete" ||
  document.readyState === "interactive"
) {
  // Document already loaded, force welcome message heights immediately
  setTimeout(() => {
    if (
      window.VoiceroVoice &&
      typeof window.VoiceroVoice.forceWelcomeMessageHeight === "function"
    ) {
      window.VoiceroVoice.forceWelcomeMessageHeight();
    }
  }, 500);
} else {
  // Wait for document to load
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      if (
        window.VoiceroVoice &&
        typeof window.VoiceroVoice.forceWelcomeMessageHeight === "function"
      ) {
        window.VoiceroVoice.forceWelcomeMessageHeight();
      }
    }, 500);
  });
}

// Also run it again after a delay to catch any welcome messages added after initialization
setTimeout(() => {
  if (
    window.VoiceroVoice &&
    typeof window.VoiceroVoice.forceWelcomeMessageHeight === "function"
  ) {
    window.VoiceroVoice.forceWelcomeMessageHeight();
  }
}, 2000);

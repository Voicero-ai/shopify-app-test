/**
 * VoiceroAI Text Module
 * Handles text chat functionality
 */

// Text interface variables
const VoiceroText = {
  isWaitingForResponse: false,
  typingTimeout: null,
  typingIndicator: null,
  currentThreadId: null,
  apiBaseUrl: null, // Will be set by VoiceroCore after API connection
  visibilityGuardInterval: null,
  websiteData: null, // Store the website data including popup questions
  customInstructions: null, // Store custom instructions from API
  messages: [], // Initialize messages array
  initialized: false, // Initialize initialized flag
  lastProductUrl: null, // Store the last product URL for redirect

  // Initialize the text module
  init: function () {
    console.log("VoiceroText initializing...");
    // Check if already initialized to prevent double initialization
    if (this.initialized) {
      console.log("VoiceroText already initialized");
      return;
    }
    // Initialize messages array
    this.messages = [];
    // Mark as initialized early to prevent initialization loops
    this.initialized = true;

    // Get API URL from Core if available
    if (window.VoiceroCore && window.VoiceroCore.getApiBaseUrl) {
      this.apiBaseUrl = VoiceroCore.getApiBaseUrl();
      console.log("Using API base URL from VoiceroCore:", this.apiBaseUrl);
      // Store access key for later use
      if (window.voiceroConfig && window.voiceroConfig.accessKey) {
        this.accessKey = window.voiceroConfig.accessKey;
        // Fetch website data including popup questions
        console.log("Fetching website data with access key:", this.accessKey);
        this.fetchWebsiteData(this.accessKey);
      }
    } else {
      console.warn(
        "VoiceroCore API URL not available, using default or env var",
      );
      // Try to get from environment or use a reasonable default
      this.apiBaseUrl =
        this.apiBaseUrl || window.API_URL || "http://localhost:3000";
    }

    // Create HTML structure for the chat interface
    console.log("Creating chat interface...");
    this.createChatInterface();

    // Verify the interface was created successfully
    const chatInterface = document.getElementById("text-chat-interface");
    if (chatInterface) {
      console.log("Text chat interface successfully created");
    } else {
      console.error("Failed to create text chat interface");
    }

    console.log("VoiceroText initialization complete");
  },

  // Open text chat interface
  openTextChat: function () {
    console.log("Opening text chat interface");
    // Hide the core buttons container
    const coreButtonsContainer = document.getElementById(
      "voice-toggle-container",
    );
    if (coreButtonsContainer) {
      coreButtonsContainer.style.display = "none";
    }

    // Check if we already initialized
    if (!this.initialized) {
      console.log("VoiceroText not initialized, initializing now");
      this.init();
      // If still not initialized after trying, report error and stop
      if (!this.initialized) {
        console.error("Failed to initialize VoiceroText, cannot open chat");
        return;
      }
    }

    // Set active interface
    if (VoiceroCore && VoiceroCore.appState) {
      console.log("Setting active interface to text in VoiceroCore");
      VoiceroCore.appState.isOpen = true;
      VoiceroCore.appState.activeInterface = "text";
      VoiceroCore.isAnyInterfaceOpen = true;
    }

    // Create isolated chat frame if not exists
    if (!this.shadowRoot) {
      console.log("Creating new shadow DOM interface");
      this.createIsolatedChatFrame();
    } else {
      console.log("Reusing existing shadow DOM interface");
    }

    // Check if we have popup questions data
    console.log(
      "Checking popup questions data before displaying chat:",
      this.websiteData?.website?.popUpQuestions || "none available",
    );

    // Make chat visible
    const shadowHost = document.getElementById("voicero-shadow-host");
    if (shadowHost) {
      console.log("Making shadow host visible");
      shadowHost.style.display = "block";
    }

    // Set up input and button listeners
    console.log("Setting up event listeners for chat interface");
    this.setupEventListeners();

    // Check if we should show welcome message
    console.log("Checking if welcome message should be shown");
    const hasMessages = this.messages && this.messages.length > 0;
    const hasShownWelcome =
      window.VoiceroCore &&
      window.VoiceroCore.appState &&
      window.VoiceroCore.appState.hasShownTextWelcome;

    if (!hasMessages && !hasShownWelcome) {
      console.log("Showing welcome message");
      const welcomeMessage = "Hi there! How can I help you with this website?";
      this.addMessage(welcomeMessage, "ai", false, true);

      // Mark welcome as shown
      if (window.VoiceroCore && window.VoiceroCore.appState) {
        window.VoiceroCore.appState.hasShownTextWelcome = true;
        window.VoiceroCore.saveState();
      }
    }

    // Show initial suggestions if available and if we haven't chatted before
    if (
      this.websiteData &&
      this.websiteData.website &&
      this.websiteData.website.popUpQuestions
    ) {
      console.log(
        "We have popup questions to display:",
        this.websiteData.website.popUpQuestions,
      );
      // Check if we already have messages (don't show suggestions if we do)
      if (this.messages && this.messages.length > 0) {
        console.log("Chat already has messages, not showing suggestions");
        // Hide suggestions in both DOM contexts
        if (this.shadowRoot) {
          const suggestions = this.shadowRoot.getElementById(
            "initial-suggestions",
          );
          if (suggestions) {
            console.log("Hiding suggestions in shadow DOM");
            suggestions.style.display = "none";
          }
        }
        const suggestions = document.getElementById("initial-suggestions");
        if (suggestions) {
          console.log("Hiding suggestions in regular DOM");
          suggestions.style.display = "none";
        }
      } else {
        console.log("No existing messages, showing popup questions");
        // Show and update suggestions
        if (this.shadowRoot) {
          const suggestions = this.shadowRoot.getElementById(
            "initial-suggestions",
          );
          if (suggestions) {
            console.log("Making suggestions visible in shadow DOM");
            suggestions.style.display = "block";
            suggestions.style.opacity = "1";
          }
        }
        // Update with the latest popup questions
        console.log("Updating popup questions in the interface");
        this.updatePopupQuestions();
      }
    } else {
      console.log("No popup questions data available, fetching from API");
      this.fetchWebsiteData(this.accessKey);
    }

    console.log("Text chat interface opened successfully");
  },

  // Fetch website data from /api/connect endpoint
  fetchWebsiteData: function (accessKey) {
    console.log("Fetching website data from /api/connect...");
    if (!this.apiBaseUrl) {
      console.error("No API URL available, cannot fetch website data");
      return;
    }
    if (!accessKey) {
      console.error("No access key provided, cannot fetch website data");
      return;
    }
    const apiUrl = `${this.apiBaseUrl}/api/connect`;
    console.log("API URL for fetch:", apiUrl);

    fetch(apiUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
    })
      .then((response) => {
        if (!response.ok) {
          console.error(
            `API validation failed: ${response.status} ${response.statusText}`,
          );
          throw new Error(`API validation failed: ${response.status}`);
        }
        console.log("API response received, parsing JSON...");
        return response.json();
      })
      .then((data) => {
        console.log("Website data fetched successfully");
        if (!data || typeof data !== "object") {
          console.error("Invalid data format received:", data);
          return;
        }
        this.websiteData = data;
        console.log("Website data stored in VoiceroText:", this.websiteData);
        console.log(
          "Popup questions in data:",
          data.website?.popUpQuestions || "none",
        );
        // Store custom instructions if available
        if (data.website && data.website.customInstructions) {
          this.customInstructions = data.website.customInstructions;
          console.log("Custom instructions set:", this.customInstructions);
        }
        // Update popup questions in the interface if it exists
        console.log("Attempting to update popup questions...");
        this.updatePopupQuestions();
      })
      .catch((error) => {
        console.error("Error fetching website data:", error);
        // Create fallback popup questions if they don't exist
        if (
          !this.websiteData ||
          !this.websiteData.website ||
          !this.websiteData.website.popUpQuestions
        ) {
          console.log("Creating fallback popup questions");
          this.websiteData = this.websiteData || {};
          this.websiteData.website = this.websiteData.website || {};
          this.websiteData.website.popUpQuestions = [
            { question: "What products do you offer?" },
            { question: "How can I contact customer support?" },
            { question: "Do you ship internationally?" },
          ];
          this.updatePopupQuestions();
        }
      });
  },

  // Update popup questions in the interface with data from API
  updatePopupQuestions: function () {
    console.log(
      "updatePopupQuestions called. Checking for popup questions data...",
    );
    if (
      !this.websiteData ||
      !this.websiteData.website ||
      !this.websiteData.website.popUpQuestions
    ) {
      console.log("No popup questions available in website data");
      console.log("websiteData:", this.websiteData);
      console.log("website property:", this.websiteData?.website);
      console.log(
        "popUpQuestions property:",
        this.websiteData?.website?.popUpQuestions,
      );
      return;
    }

    const popupQuestions = this.websiteData.website.popUpQuestions;
    console.log(
      "Updating popup questions with data:",
      JSON.stringify(popupQuestions),
    );

    // Store reference to this for event handlers
    const self = this;

    // Debug function to log DOM structure of suggestions
    const debugSuggestions = function (container, context) {
      console.log("----- Debug suggestions in " + context + " -----");
      if (!container) {
        console.log("Container is null");
        return;
      }
      const initialSuggestions = container.querySelector(
        "#initial-suggestions",
      );
      if (!initialSuggestions) {
        console.log("No #initial-suggestions element found");
        return;
      }
      console.log("Initial suggestions element:", initialSuggestions.tagName);
      console.log("Display style:", initialSuggestions.style.display);
      console.log("Opacity:", initialSuggestions.style.opacity);

      const suggestionContainer =
        initialSuggestions.querySelector("div:nth-child(2)");
      if (!suggestionContainer) {
        console.log("No suggestions container div found");
        return;
      }
      const suggestions = suggestionContainer.querySelectorAll(".suggestion");
      console.log("Found " + suggestions.length + " suggestion elements");
      suggestions.forEach(function (s, i) {
        console.log("  Suggestion " + (i + 1) + ": " + s.textContent.trim());
      });
      console.log("----- End debug suggestions -----");
    };

    // Find initial suggestions container in both shadow DOM and regular DOM
    const updateSuggestions = function (container) {
      console.log(
        "updateSuggestions called with container:",
        container ? container.tagName : "null",
      );
      if (!container) {
        console.log("Container is null, skipping");
        return;
      }
      const suggestionsContainer = container.querySelector(
        "#initial-suggestions",
      );
      console.log(
        "Found suggestions container:",
        suggestionsContainer ? "yes" : "no",
      );
      if (!suggestionsContainer) {
        console.log("Could not find #initial-suggestions in the container");
        // Debug the container's HTML to help diagnose issues
        console.log(
          "Container contents:",
          container.innerHTML.substring(0, 100) + "...",
        );
        return;
      }
      // Get the div that contains the suggestions
      const suggestionsDiv =
        suggestionsContainer.querySelector("div:nth-child(2)");
      console.log("Found suggestions div:", suggestionsDiv ? "yes" : "no");
      if (!suggestionsDiv) {
        console.log("No suggestions div found (div:nth-child(2))");
        console.log(
          "Suggestions container HTML:",
          suggestionsContainer.innerHTML.substring(0, 100) + "...",
        );
        return;
      }
      // Clear existing suggestions
      suggestionsDiv.innerHTML = "";
      console.log("Cleared existing suggestions");

      // Add new suggestions from API
      popupQuestions.forEach(function (item, index) {
        const questionText = item.question || "Ask me a question";
        console.log("Adding question " + (index + 1) + ":", questionText);
        suggestionsDiv.innerHTML +=
          '<div class="suggestion" style="' +
          "background: #882be6;" +
          "padding: 8px 14px;" +
          "border-radius: 8px;" +
          "cursor: pointer;" +
          "transition: all 0.2s ease;" +
          "color: white;" +
          "font-weight: 500;" +
          "text-align: left;" +
          "font-size: 13px;" +
          "margin-bottom: 6px;" +
          '">' +
          questionText +
          "</div>";
      });

      // Re-attach event listeners to the new suggestions
      const suggestions = suggestionsDiv.querySelectorAll(".suggestion");
      console.log(
        "Attaching event listeners to " + suggestions.length + " suggestions",
      );
      suggestions.forEach(function (suggestion) {
        suggestion.addEventListener("click", function () {
          const text = this.textContent.trim();
          console.log("Suggestion clicked:", text);
          // Use self to reference the VoiceroText object
          if (self.sendChatMessage) {
            self.sendChatMessage(text);
          } else {
            console.error("sendChatMessage function not found");
          }
          // Hide suggestions
          suggestionsContainer.style.display = "none";
        });
      });

      // Make sure suggestions are visible
      suggestionsContainer.style.display = "block";
      suggestionsContainer.style.opacity = "1";
      suggestionsContainer.style.height = "auto";
      console.log("Popup questions updated in interface successfully");
    };

    // Update in regular DOM
    console.log("Updating suggestions in regular DOM");
    updateSuggestions(document);
    debugSuggestions(document, "regular DOM");

    // Update in shadow DOM if it exists
    if (this.shadowRoot) {
      console.log("Updating suggestions in shadow DOM");
      updateSuggestions(this.shadowRoot);
      debugSuggestions(this.shadowRoot, "shadow DOM");
    } else {
      console.log("Shadow DOM not available, skipping update there");
    }
  },

  // Create the chat interface HTML structure
  createChatInterface: function () {
    console.log("Creating text chat interface HTML...");
    try {
      // First check if elements already exist
      const existingInterface = document.getElementById("text-chat-interface");
      if (existingInterface) {
        console.log(
          "Text chat interface already exists, checking for messages container",
        );
        const messagesContainer = document.getElementById("chat-messages");
        if (messagesContainer) {
          console.log("Chat messages container already exists");
          return;
        } else {
          console.log(
            "Chat interface exists but messages container is missing, will create a new one",
          );
          // Remove existing interface to rebuild it completely
          existingInterface.remove();
        }
      }

      console.log("Building new chat interface elements...");

      // Add CSS styles
      const styleEl = document.createElement("style");
      styleEl.innerHTML = `
        @keyframes gradientMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @keyframes gradientBorder {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .typing-indicator {
          display: flex !important;
          gap: 4px;
          padding: 8px 12px;
          background: #f0f0f0;
          border-radius: 12px;
          width: fit-content;
          opacity: 1 !important;
          margin-bottom: 0;
        }

        .typing-dot {
          width: 8px;
          height: 8px;
          background: #666;
          border-radius: 50%;
          animation: typingAnimation 1s infinite;
          opacity: 1;
        }

        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes typingAnimation {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-8px); }
        }

        .user-message {
          display: flex;
          justify-content: flex-end;
        }

        .user-message .message-content {
          background: #882be6;
          color: white;
          border-radius: 12px 12px 0 12px;
          padding: 10px 14px;
          max-width: 65%;
          word-wrap: break-word;
          font-size: 14px;
          line-height: 1.4;
        }

        .ai-message {
          display: flex;
          justify-content: flex-start;
        }

        .ai-message .message-content {
          background: #f0f0f0;
          color: #333;
          border-radius: 12px 12px 12px 0;
          padding: 10px 14px;
          max-width: 65%;
          word-wrap: break-word;
          font-size: 14px;
          line-height: 1.4;
        }

        .chat-link {
          color: #882be6;
          text-decoration: none;
          font-weight: 500;
          position: relative;
          transition: all 0.2s ease;
        }

        .chat-link:hover {
          text-decoration: underline;
          opacity: 0.9;
        }
      `;
      document.head.appendChild(styleEl);
      console.log("Chat CSS styles added");

      // Create interface container first
      const interfaceContainer = document.createElement("div");
      interfaceContainer.id = "text-chat-interface";
      interfaceContainer.dataset.chatContainer = "true"; // Add data attribute for easier selection
      interfaceContainer.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        width: 56vw;
        max-width: 960px;
        min-width: 280px;
        display: none;
        z-index: 2147483647; /* Maximum possible z-index value */
        user-select: none;
      `;

      // Create messages container
      const messagesContainer = document.createElement("div");
      messagesContainer.id = "chat-messages";
      messagesContainer.style.cssText = `
        background: white;
        border-radius: 12px 12px 0 0;
        padding: 15px;
        padding-top: 45px; /* Increased to make room for sticky header */
        margin-bottom: 0;
        max-height: 40vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        position: relative;
        transition: all 0.3s ease;
      `;

      // Create a sticky header for controls
      const controlsHeader = document.createElement("div");
      controlsHeader.id = "chat-controls-header";
      controlsHeader.style.cssText = `
        position: sticky;
        top: 0;
        left: 0;
        right: 0;
        height: 36px;
        background: white;
        z-index: 10;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 5px 10px;
        border-bottom: 1px solid #f0f0f0;
        border-radius: 12px 12px 0 0;
        margin-bottom: 10px;
      `;

      // Move the clear button to the header
      const clearButton =
        document.getElementById("clear-text-chat") ||
        (this.shadowRoot
          ? this.shadowRoot.getElementById("clear-text-chat")
          : null);
      if (clearButton) {
        // Update clearButton styles for the sticky header
        clearButton.style.position = "relative";
        clearButton.style.top = "auto";
        clearButton.style.left = "auto";
        controlsHeader.appendChild(clearButton);
      }

      // Move the close button to the header
      const closeButton =
        document.getElementById("close-text-chat") ||
        (this.shadowRoot
          ? this.shadowRoot.getElementById("close-text-chat")
          : null);
      if (closeButton) {
        // Update closeButton styles for the sticky header
        closeButton.style.position = "relative";
        closeButton.style.top = "auto";
        closeButton.style.right = "auto";
        controlsHeader.appendChild(closeButton);
      }

      // Add minimize button to the header
      const minimizeButton = document.createElement("button");
      minimizeButton.id = "minimize-text-chat";
      minimizeButton.setAttribute("onclick", "VoiceroText.minimizeChat()");
      minimizeButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round">
          <path d="M8 3h8m-8 18h8M4 8v8m16-8v8"/>
        </svg>
      `;
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
      controlsHeader.appendChild(minimizeButton);

      // Insert the controls header at the top of the messages container
      messagesContainer.insertBefore(
        controlsHeader,
        messagesContainer.firstChild,
      );

      // Add minimize and close buttons
      messagesContainer.innerHTML = `
        <button
          id="close-chat"
          onclick="VoiceroText.closeTextChat()"
          style="
            position: absolute;
            top: 10px;
            right: 40px;
            background: none;
            border: none;
            cursor: pointer;
            padding: 5px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            z-index: 1001;
          "
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>

        <button
          id="maximize-chat"
          onclick="VoiceroText.maximizeChat()"
          style="
            position: fixed;
            top: 0;
            right: 10px;
            background: white;
            border: none;
            cursor: pointer;
            padding: 8px;
            border-radius: 50%;
            display: none;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            z-index: 2147483647;
            width: 32px;
            height: 32px;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            transform: translateY(-45px);
          "
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round">
            <path d="M8 3v18m8-18v18M4 8h16m-16 8h16"/>
          </svg>
        </button>

        <div id="loading-bar" style="
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
        "></div>

        <!-- Add initial suggestions directly in messages area -->
        <div id="initial-suggestions" style="
          padding: 10px 0;
          opacity: 1;
          transition: all 0.3s ease;
        ">
          <div style="
            color: #666;
            font-size: 13px;
            margin-bottom: 10px;
            text-align: center;
          ">
            Try asking one of these questions:
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <!-- Suggestions will be populated from the API -->
            <div class="suggestion" style="
              background: #882be6;
              padding: 8px 14px;
              border-radius: 8px;
              cursor: pointer;
              transition: all 0.2s ease;
              color: white;
              font-weight: 500;
              text-align: left;
              font-size: 13px;
            ">What's the best snowboard you have? 🤔</div>
            <div class="suggestion" style="
              background: #882be6;
              padding: 8px 14px;
              border-radius: 8px;
              cursor: pointer;
              transition: all 0.2s ease;
              color: white;
              font-weight: 500;
              text-align: left;
              font-size: 13px;
            ">Do you do international shipping? 📜</div>
            <div class="suggestion" style="
              background: #882be6;
              padding: 8px 14px;
              border-radius: 8px;
              cursor: pointer;
              transition: all 0.2s ease;
              color: white;
              font-weight: 500;
              text-align: left;
              font-size: 13px;
            ">Where can I go to contact you? 🎯</div>
          </div>
        </div>
      `;

      // Create input container with border
      const inputContainer = document.createElement("div");
      inputContainer.id = "chat-input-wrapper";
      inputContainer.style.cssText = `
        position: relative;
        padding: 2px;
        background: linear-gradient(90deg, #882be6, #ff4444, #882be6);
        background-size: 200% 100%;
        border-radius: 0 0 12px 12px;
        animation: gradientBorder 3s linear infinite;
      `;

      // Add maximize button (OUTSIDE the input area for better visibility)
      const maximizeButton = document.createElement("button");
      maximizeButton.id = "maximize-chat";
      maximizeButton.setAttribute("onclick", "VoiceroText.maximizeChat()");
      maximizeButton.style.cssText = `
        position: fixed;
        bottom: 95px;
        left: 50%;
        right: auto;
        transform: translateX(-50%);
        width: 42px;
        height: 42px;
        background: white;
        border: none;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
        z-index: 2147483647;
        transition: all 0.2s ease;
      `;
      maximizeButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round">
          <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
        </svg>
      `;
      inputContainer.appendChild(maximizeButton);

      // Add input field and send button
      inputContainer.innerHTML += `
        <div style="
          display: flex;
          align-items: center;
          background: white;
          border-radius: 0 0 12px 12px;
          padding: 5px;
        ">
          <input
            type="text"
            id="chat-input"
            placeholder="Ask me anything..."
            style="
              flex: 1;
              border: none;
              padding: 12px 20px;
              font-size: 16px;
              outline: none;
              background: transparent;
              border-radius: 50px;
            "
          >
          <button id="send-message-btn" style="
            background: #882be6;
            border: none;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            margin-right: 5px;
            transition: all 0.3s ease;
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"></path>
            </svg>
          </button>
        </div>
      `;

      // Assemble interface
      interfaceContainer.appendChild(messagesContainer);
      interfaceContainer.appendChild(inputContainer);
      document.body.appendChild(interfaceContainer);
      console.log("Text chat interface HTML created successfully");
      console.log(
        "Interface element created:",
        document.getElementById("text-chat-interface") !== null,
      );
      console.log(
        "Messages container created:",
        document.getElementById("chat-messages") !== null,
      );
      console.log(
        "Input field created:",
        document.getElementById("chat-input") !== null,
      );

      // Set up event listeners
      this.setupEventListeners();

      // Update popup questions if we have already fetched them
      if (
        this.websiteData &&
        this.websiteData.website &&
        this.websiteData.website.popUpQuestions
      ) {
        this.updatePopupQuestions();
      }
    } catch (error) {
      console.error("Error creating chat interface:", error);
    }
  },

  // Set up event listeners for chat interface
  setupEventListeners: function () {
    console.log("Setting up input listeners for chat interface");
    // Setup for shadow DOM
    if (this.shadowRoot) {
      // Add keydown listener to chat input
      const chatInput = this.shadowRoot.getElementById("chat-input");
      if (chatInput) {
        chatInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
          }
        });
        console.log("Added keydown listener to chat input");
      }

      // Add click listener to send button
      const sendBtn = this.shadowRoot.getElementById("send-message-btn");
      if (sendBtn) {
        sendBtn.addEventListener("click", () => {
          this.sendMessage();
        });
        console.log("Added click listener to send button");
      }

      // Set up suggestion click listeners
      this.setupSuggestionListeners();
    }
  },

  // Set up listeners for suggestion clicks
  setupSuggestionListeners: function () {
    console.log("Setting up suggestion click listeners");
    // For shadow DOM
    if (this.shadowRoot) {
      const initialSuggestions = this.shadowRoot.getElementById(
        "initial-suggestions",
      );
      if (initialSuggestions) {
        const suggestions = initialSuggestions.querySelectorAll(".suggestion");
        console.log(`Found ${suggestions.length} suggestions in shadow DOM`);
        suggestions.forEach((suggestion, index) => {
          suggestion.addEventListener("click", () => {
            const text = suggestion.textContent.trim();
            console.log(`Suggestion ${index + 1} clicked: "${text}"`);
            // Send the message
            this.sendChatMessage(text);
            // Hide suggestions
            initialSuggestions.style.display = "none";
          });
        });
        console.log("Set up suggestion click listeners");
      } else {
        console.log("No suggestions container found in shadow DOM");
      }
    }
  },

  // Set loading state
  setLoading: function (isLoading) {
    // Get loading bar element (check Shadow DOM first)
    const loadingBar = this.shadowRoot
      ? this.shadowRoot.getElementById("loading-bar")
      : document.getElementById("loading-bar");
    if (!loadingBar) return;

    if (isLoading) {
      loadingBar.style.display = "block";
      loadingBar.style.width = "100%";
    } else {
      loadingBar.style.display = "none";
      loadingBar.style.width = "0%";
    }
  },

  // Close text chat interface
  closeTextChat: function () {
    console.log("Closing text chat interface");
    // Show the core buttons container
    const coreButtonsContainer = document.getElementById(
      "voice-toggle-container",
    );
    if (coreButtonsContainer) {
      coreButtonsContainer.style.display = "block";
    }

    // Hide chat interface in both regular DOM and shadow DOM
    const textInterface = document.getElementById("text-chat-interface");
    if (textInterface) {
      textInterface.style.display = "none";
    }

    // Hide shadow DOM interface if it exists
    const shadowHost = document.getElementById("voicero-shadow-host");
    if (shadowHost) {
      shadowHost.style.display = "none";
    }

    // Update app state
    if (VoiceroCore) {
      VoiceroCore.appState.isOpen = false;
      VoiceroCore.appState.activeInterface = null;
      VoiceroCore.saveState();

      // Reopen the chooser interface
      console.log("Reopening chooser interface");

      // Use the VoiceroCore method to show the chooser
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
          // If chooser doesn't exist yet, initialize it
          VoiceroCore.init();
        }
      }
    }

    // Stop visibility guard
    if (this.visibilityGuardInterval) {
      clearInterval(this.visibilityGuardInterval);
    }
  },

  // Completely revamp the minimizeChat function to ensure the maximize button is visible
  minimizeChat: function () {
    console.log("Minimizing text chat interface");
    const messagesContainer = this.shadowRoot
      ? this.shadowRoot.getElementById("chat-messages")
      : document.getElementById("chat-messages");
    const chatInterface = document.getElementById("voicero-shadow-host");

    if (!messagesContainer || !chatInterface) {
      console.error("Required elements not found for minimizing chat");
      return;
    }

    // Hide messages container with animation
    messagesContainer.style.maxHeight = "0";
    messagesContainer.style.opacity = "0";
    messagesContainer.style.padding = "0";
    messagesContainer.style.overflow = "hidden";

    // Update interface container style
    chatInterface.style.borderRadius = "12px";

    // FIRST REMOVE ANY EXISTING MAXIMIZE BUTTONS
    const existingMaximizeBtn = document.getElementById(
      "voicero-maximize-fixed",
    );
    if (existingMaximizeBtn) {
      existingMaximizeBtn.remove();
    }

    // CREATE A NEW MAXIMIZE BUTTON DIRECTLY IN THE BODY
    const newMaxBtn = document.createElement("button");
    newMaxBtn.id = "voicero-maximize-fixed";
    newMaxBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#882be6" stroke-width="2" stroke-linecap="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <path d="M3 9h18"></path>
        <path d="M9 21V9"></path>
      </svg>
    `;

    // Style the button for maximum visibility
    newMaxBtn.style.cssText = `
      position: fixed;
      bottom: 95px;
      left: 50%;
      right: auto;
      transform: translateX(-50%);
      width: 42px;
      height: 42px;
      background: white;
      border: none;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
      z-index: 2147483647;
      transition: all 0.2s ease;
    `;

    // Update hover effect for centered button
    newMaxBtn.onmouseover = function () {
      this.style.transform = "translateX(-50%) scale(1.1)";
    };

    newMaxBtn.onmouseout = function () {
      this.style.transform = "translateX(-50%)";
    };

    // Add click event
    newMaxBtn.onclick = () => {
      this.maximizeChat();
      newMaxBtn.remove(); // Remove button after maximizing
    };

    // Add to document body
    document.body.appendChild(newMaxBtn);

    console.log("Created new maximize button outside shadow DOM");

    // Update state
    if (VoiceroCore) {
      VoiceroCore.appState.isTextMinimized = true;
      VoiceroCore.saveState();
    }
  },

  // Update the maximizeChat function to handle the new button
  maximizeChat: function () {
    console.log("Maximizing text chat interface");

    // Remove any standalone maximize button
    const standaloneMaxBtn = document.getElementById("voicero-maximize-fixed");
    if (standaloneMaxBtn) {
      standaloneMaxBtn.remove();
    }

    const messagesContainer = this.shadowRoot
      ? this.shadowRoot.getElementById("chat-messages")
      : document.getElementById("chat-messages");
    const chatInterface = document.getElementById("voicero-shadow-host");

    if (!messagesContainer) {
      console.error("Messages container not found when trying to maximize");
      return;
    }

    // Make sure the shadow host is fully visible first
    if (chatInterface) {
      chatInterface.style.display = "block";
      chatInterface.style.opacity = "1";
      chatInterface.style.visibility = "visible";
    }

    // Restore messages container with animation
    messagesContainer.style.maxHeight = "40vh";
    messagesContainer.style.opacity = "1";
    messagesContainer.style.padding = "15px";
    messagesContainer.style.paddingTop = "35px";
    messagesContainer.style.overflow = "auto";
    messagesContainer.style.height = "auto";
    messagesContainer.style.visibility = "visible";

    // Update container style
    if (chatInterface) {
      chatInterface.style.borderRadius = "12px 12px 0 0";
    }

    // Add a small delay to ensure styles are applied
    setTimeout(() => {
      // Force a reflow to ensure styles are applied
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }, 100);

    // Update state
    if (VoiceroCore) {
      VoiceroCore.appState.isTextMinimized = false;
      VoiceroCore.saveState();
    }
  },

  // Helper function to adjust container padding
  adjustContainerPadding: function (hasSuggestions) {
    // Get messages container (check Shadow DOM first)
    const messagesContainer = this.shadowRoot
      ? this.shadowRoot.getElementById("chat-messages")
      : document.getElementById("chat-messages");
    if (!messagesContainer) return;

    if (hasSuggestions) {
      // Set padding for when suggestions are visible
      messagesContainer.style.paddingTop = "35px";
    } else {
      // Reduce padding when suggestions are hidden
      messagesContainer.style.paddingTop = "15px";
    }
  },

  // Add message to the chat
  addMessage: function (
    content,
    role,
    formatMarkdown = false,
    keepSuggestions = false,
    saveToHistory = true,
  ) {
    console.log(`Adding ${role} message, keepSuggestions=${keepSuggestions}`);
    // Get messages container (check Shadow DOM first)
    const messagesContainer = this.shadowRoot
      ? this.shadowRoot.getElementById("chat-messages")
      : document.getElementById("chat-messages");
    if (!messagesContainer) {
      console.error("Messages container not found");
      return;
    }

    // Hide initial suggestions only if this is a user message or if we're not keeping suggestions
    if (role === "user" || !keepSuggestions) {
      const initialSuggestions = messagesContainer.querySelector(
        "#initial-suggestions",
      );
      if (initialSuggestions) {
        // Only hide suggestions for user messages (not for AI welcome)
        if (role === "user") {
          initialSuggestions.style.display = "none";
          initialSuggestions.style.opacity = "0";
          initialSuggestions.style.height = "0";
          initialSuggestions.style.margin = "0";
          initialSuggestions.style.padding = "0";
          initialSuggestions.style.overflow = "hidden";
          // Adjust container padding & height after hiding suggestions
          messagesContainer.style.paddingTop = "15px";
          messagesContainer.style.minHeight = "150px";
          // Mark that we've shown a user message to prevent suggestions from reappearing
          if (VoiceroCore && VoiceroCore.appState) {
            VoiceroCore.appState.hasUserMessage = true;
            VoiceroCore.saveState();
          }
        } else if (!keepSuggestions) {
          initialSuggestions.style.display = "none";
          initialSuggestions.style.opacity = "0";
          initialSuggestions.style.height = "0";
          initialSuggestions.style.margin = "0";
          initialSuggestions.style.padding = "0";
          initialSuggestions.style.overflow = "hidden";
          // Adjust container padding & height after hiding suggestions
          messagesContainer.style.paddingTop = "15px";
          messagesContainer.style.minHeight = "150px";
        }
      }
    }

    // Create message element
    const messageEl = document.createElement("div");
    messageEl.className = role === "user" ? "user-message" : "ai-message";
    messageEl.style.cssText = `
      margin-bottom: 15px;
      animation: fadeIn 0.3s ease forwards;
    `;

    // Create message content
    const messageContent = document.createElement("div");
    messageContent.className = "message-content";

    // Format content if needed
    if (formatMarkdown && role === "ai" && VoiceroCore) {
      messageContent.innerHTML = VoiceroCore.formatMarkdown(content);
    } else {
      messageContent.textContent = content;
    }

    // Add message content to message
    messageEl.appendChild(messageContent);

    // Add message to container
    messagesContainer.appendChild(messageEl);

    // Save this message to conversation history if not a placeholder
    if (
      saveToHistory &&
      content !== "Generating response..." &&
      !content.includes("Thinking...") &&
      content !== "..."
    ) {
      this.saveMessageToHistory(content, role);
    }

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    return messageEl;
  },

  // Save message to conversation history
  saveMessageToHistory: function (content, role) {
    // Get existing history or initialize new array
    let messageHistory = JSON.parse(
      localStorage.getItem("voicero_text_message_history") || "[]",
    );

    // Add the new message
    messageHistory.push({
      content: content,
      role: role,
      timestamp: new Date().toISOString(),
    });

    // Store back in localStorage
    localStorage.setItem(
      "voicero_text_message_history",
      JSON.stringify(messageHistory),
    );

    // Also update the VoiceroCore state if available
    if (VoiceroCore && VoiceroCore.appState) {
      VoiceroCore.appState.textMessageHistory = messageHistory;
      VoiceroCore.saveState();
    }
  },

  // Load conversation history from localStorage
  loadMessageHistory: function () {
    try {
      const messageHistory = JSON.parse(
        localStorage.getItem("voicero_text_message_history") || "[]",
      );
      return messageHistory;
    } catch (e) {
      console.error("Error loading text message history:", e);
      return [];
    }
  },

  // Display all messages from history
  displayMessageHistory: function () {
    // Get messages container (check Shadow DOM first)
    const messagesContainer = this.shadowRoot
      ? this.shadowRoot.getElementById("chat-messages")
      : document.getElementById("chat-messages");
    if (!messagesContainer) return;

    // Get initial suggestions if they exist
    const initialSuggestions = messagesContainer.querySelector(
      "#initial-suggestions",
    );

    // Remove existing message elements but keep control buttons and suggestions
    const existingMessages = messagesContainer.querySelectorAll(
      ".user-message, .ai-message",
    );
    existingMessages.forEach((el) => el.remove());

    // Get message history
    const messageHistory = this.loadMessageHistory();

    // Skip displaying if empty
    if (!messageHistory || messageHistory.length === 0) {
      // Make sure suggestions are visible if no messages
      if (initialSuggestions) {
        initialSuggestions.style.display = "block";
        initialSuggestions.style.opacity = "1";
      }
      return;
    }

    // Hide initial suggestions if we have messages
    if (initialSuggestions) {
      initialSuggestions.style.display = "none";
      initialSuggestions.style.opacity = "0";
      initialSuggestions.style.height = "0";
      initialSuggestions.style.margin = "0";
      initialSuggestions.style.padding = "0";
      initialSuggestions.style.overflow = "hidden";
    }

    // Filter out duplicate welcome messages
    const filteredHistory = [];
    const seen = new Set();
    const welcomeMessage = "Hi there! How can I help you with this store?";
    let hasAddedWelcome = false;

    messageHistory.forEach((msg) => {
      // For welcome messages, only add the first one
      if (msg.content === welcomeMessage && msg.role === "ai") {
        if (!hasAddedWelcome) {
          filteredHistory.push(msg);
          hasAddedWelcome = true;
        }
      } else {
        // For other messages, only add if we haven't seen this exact content+role
        const key = `${msg.role}:${msg.content}`;
        if (!seen.has(key)) {
          filteredHistory.push(msg);
          seen.add(key);
        }
      }
    });

    // Add each message to the interface without saving to history again
    filteredHistory.forEach((msg) => {
      // Create message element
      const messageEl = document.createElement("div");
      messageEl.className = msg.role === "user" ? "user-message" : "ai-message";
      messageEl.style.cssText = `
        margin-bottom: 15px;
        animation: fadeIn 0.3s ease forwards;
      `;
      // Create message content
      const messageContent = document.createElement("div");
      messageContent.className = "message-content";

      // Format content if needed for AI messages
      if (msg.role === "ai" && VoiceroCore) {
        messageContent.innerHTML = VoiceroCore.formatMarkdown(msg.content);
      } else {
        messageContent.textContent = msg.content;
      }
      // Add to DOM
      messageEl.appendChild(messageContent);
      messagesContainer.appendChild(messageEl);
    });

    // Update VoiceroCore state
    if (VoiceroCore && VoiceroCore.appState) {
      VoiceroCore.appState.hasUserMessage = true;
      // Update the saved message history to remove duplicates
      if (filteredHistory.length !== messageHistory.length) {
        console.log("Updating message history to remove duplicates");
        localStorage.setItem(
          "voicero_text_message_history",
          JSON.stringify(filteredHistory),
        );
        VoiceroCore.appState.textMessageHistory = filteredHistory;
      }
      VoiceroCore.saveState();
    }

    // Scroll to the bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  },

  // Add typing indicator
  addTypingIndicator: function () {
    // Get messages container (check Shadow DOM first)
    const messagesContainer = this.shadowRoot
      ? this.shadowRoot.getElementById("chat-messages")
      : document.getElementById("chat-messages");
    if (!messagesContainer) {
      console.error("Messages container not found");
      return;
    }

    // Create typing indicator
    const indicator = document.createElement("div");
    indicator.className = "typing-indicator";
    indicator.id = "typing-indicator";
    indicator.style.cssText = `
      display: flex;
      gap: 4px;
      padding: 8px 12px;
      background: #f0f0f0;
      border-radius: 12px;
      width: fit-content;
      opacity: 1;
      margin-bottom: 15px;
    `;

    // Add dots
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("div");
      dot.className = "typing-dot";
      dot.style.cssText = `
        width: 8px;
        height: 8px;
        background: #666;
        border-radius: 50%;
        animation: typingAnimation 1s infinite;
      `;
      if (i === 1) dot.style.animationDelay = "0.2s";
      if (i === 2) dot.style.animationDelay = "0.4s";
      indicator.appendChild(dot);
    }

    // Add to container
    messagesContainer.appendChild(indicator);
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  },

  // Remove typing indicator
  removeTypingIndicator: function () {
    // First check in Shadow DOM
    if (this.shadowRoot) {
      const indicator = this.shadowRoot.getElementById("typing-indicator");
      if (indicator) {
        indicator.remove();
        return;
      }
    }
    // Then check in main document
    const indicator = document.getElementById("typing-indicator");
    if (indicator) {
      indicator.remove();
    }
  },

  // Restore messages from state
  restoreMessages: function () {
    if (!VoiceroCore || !VoiceroCore.appState || !VoiceroCore.appState.messages)
      return;

    // Get messages container (check Shadow DOM first)
    const messagesContainer = this.shadowRoot
      ? this.shadowRoot.getElementById("chat-messages")
      : document.getElementById("chat-messages");
    if (!messagesContainer) {
      console.error("Messages container not found for restoring messages");
      return;
    }

    console.log("Restoring messages from state");
    // Check if we have any messages to restore
    if (VoiceroCore.appState.messages.length === 0) {
      console.log("No messages to restore, ensuring suggestions are visible");
      const initialSuggestions = messagesContainer.querySelector(
        "#initial-suggestions",
      );
      if (initialSuggestions) {
        initialSuggestions.style.display = "block";
        initialSuggestions.style.opacity = "1";
      }
      return;
    }

    // Clear existing messages
    const initialSuggestions = messagesContainer.querySelector(
      "#initial-suggestions",
    );
    if (initialSuggestions) {
      // Save initial suggestions
      const savedSuggestions = initialSuggestions.cloneNode(true);
      // Clear messages
      messagesContainer.innerHTML = "";
      // Add back the initial suggestions
      messagesContainer.appendChild(savedSuggestions);
      // But keep them hidden if we've had user messages before
      if (VoiceroCore.appState.hasUserMessage) {
        savedSuggestions.style.display = "none";
        savedSuggestions.style.opacity = "0";
      }
    } else {
      // Just clear messages
      messagesContainer.innerHTML = "";
    }

    // Add messages from state
    let hasUserMessages = false;
    VoiceroCore.appState.messages.forEach((message) => {
      // Map old format to new format if needed
      const content = message.content || message.text;
      const role = message.role || message.sender;
      if (content && role) {
        this.addMessage(content, role);
        if (role === "user") {
          hasUserMessages = true;
        }
      }
    });

    // Update the flag based on whether we found user messages
    if (hasUserMessages) {
      VoiceroCore.appState.hasUserMessage = true;
      // Make sure suggestions stay hidden
      const initialSuggestions = messagesContainer.querySelector(
        "#initial-suggestions",
      );
      if (initialSuggestions) {
        initialSuggestions.style.display = "none";
        initialSuggestions.style.opacity = "0";
      }
    } else if (!VoiceroCore.appState.hasUserMessage) {
      // If no user messages were added and we haven't marked hasUserMessage, make sure suggestions are visible
      console.log("No user messages found, ensuring suggestions are visible");
      const initialSuggestions = messagesContainer.querySelector(
        "#initial-suggestions",
      );
      if (initialSuggestions) {
        initialSuggestions.style.display = "block";
        initialSuggestions.style.opacity = "1";
      }
    }

    // Save updated state
    VoiceroCore.saveState();
  },

  // Extract URLs from text and clean the text
  extractAndCleanUrls: function (text) {
    // Store extracted URLs
    const extractedUrls = [];

    // Format currency for better readability
    text = this.formatCurrencyForSpeech(text);

    // First handle markdown-style links [text](url)
    const markdownRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let markdownMatch;
    let cleanedText = text;

    // Extract markdown URLs and replace them with just the text part
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
    // Find all regular URLs in the text
    const textWithoutMarkdown = cleanedText;
    while ((match = urlRegex.exec(textWithoutMarkdown)) !== null) {
      let url = match[0];
      // Remove trailing punctuation that might have been included
      url = url.replace(/[.,;:!?)]+$/, "");
      try {
        // Ensure URL has proper protocol
        const formattedUrl = url.startsWith("http") ? url : `https://${url}`;
        // Test if it's a valid URL before adding
        new URL(formattedUrl);
        // Only add if it's not already in the list
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
    // Make sure the URL is properly formed
    try {
      // Test if the URL is valid
      new URL(url);
      console.log("Redirecting to URL:", url);

      // Before redirecting, save state that we were in text chat mode
      if (VoiceroCore) {
        // Save that we should reactivate text chat on next page load
        localStorage.setItem("voicero_reactivate_text", "true");
        // Make sure VoiceroCore state is also set correctly
        if (VoiceroCore.appState) {
          // Ensure we've properly marked that a user message was sent
          VoiceroCore.appState.hasUserMessage = true;
          // Update state to reactivate properly
          VoiceroCore.appState.isOpen = true;
          VoiceroCore.appState.activeInterface = "text";
          VoiceroCore.appState.isTextMinimized = false;
          // Explicitly save the state to ensure message history is preserved
          VoiceroCore.saveState();
          console.log(
            "Saved text chat state before redirect with message history:",
            VoiceroCore.appState.messages.length,
            "messages",
          );
        }
      }
      // Navigate in the same tab instead of opening a new one
      window.location.href = url;
    } catch (error) {
      console.error("Invalid URL, cannot redirect:", url, error);
      // Add a fallback notification if URL is invalid
      if (this.shadowRoot) {
        const aiMessageDiv = this.shadowRoot.querySelector(".ai-message");
        if (aiMessageDiv && aiMessageDiv.querySelector(".message-content")) {
          const messageContent = aiMessageDiv.querySelector(".message-content");
          // Create notification
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
          // Append to message
          messageContent.appendChild(notificationElement);
          // Scroll to bottom to ensure notification is visible
          const messagesContainer =
            this.shadowRoot.getElementById("chat-messages");
          if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        }
      } else {
        // Fallback to regular document if shadow DOM not available
        const aiMessageDiv = document.querySelector(
          "#text-chat-interface .ai-message",
        );
        if (aiMessageDiv && aiMessageDiv.querySelector(".message-content")) {
          const messageContent = aiMessageDiv.querySelector(".message-content");
          // Create notification
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
          // Append to message
          messageContent.appendChild(notificationElement);
          // Scroll to bottom to ensure notification is visible
          const messagesContainer = document.getElementById("chat-messages");
          if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        }
      }
    }
  },

  // Format currency values for better readability in text
  formatCurrencyForSpeech: function (text) {
    // Replace currency patterns like $X.XX with "X dollars and XX cents"
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

  // Send a message to the backend API
  sendMessage: async function () {
    console.log("Attempting to send message");
    // Get chat input element (check Shadow DOM first)
    const chatInput = this.shadowRoot
      ? this.shadowRoot.getElementById("chat-input")
      : document.getElementById("chat-input");
    // Exit if chat input not found
    if (!chatInput) {
      console.error("Chat input element not found");
      return;
    }
    // Get message from input
    const message = chatInput.value.trim();
    // Exit if message is empty
    if (!message) {
      console.log("Empty message, not sending");
      return;
    }

    console.log("Sending message:", message);

    // If the chat is minimized, maximize it first
    if (VoiceroCore && VoiceroCore.appState.isTextMinimized) {
      console.log("Chat was minimized, maximizing before sending message");
      this.maximizeChat();
    }

    // Clear input
    chatInput.value = "";

    // Add user message to chat
    this.addMessage(message, "user");

    // Show loading state
    this.setLoading(true);

    // Hide any initial suggestions
    const initialSuggestions = this.shadowRoot
      ? this.shadowRoot.getElementById("initial-suggestions")
      : document.getElementById("initial-suggestions");
    if (initialSuggestions) {
      initialSuggestions.style.display = "none";
    }

    try {
      // Add typing indicator
      this.addTypingIndicator();

      // Prepare request data
      const requestData = {
        message,
        url: window.location.href,
        threadId: VoiceroCore ? VoiceroCore.currentThreadId || "" : "",
        type: "text",
        source: "voicero",
      };

      // Get API URL - Now use the shopify/chat endpoint
      const apiUrl = VoiceroCore
        ? `${VoiceroCore.getApiBaseUrl()}/api/shopify/chat`
        : "http://localhost:3000/api/shopify/chat";

      // Send request to API
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${window.voiceroConfig.accessKey}`,
        },
        body: JSON.stringify(requestData),
      });

      // Check if response is ok
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      // Parse response
      const data = await response.json();
      console.log("API response:", data);

      // Remove typing indicator
      this.removeTypingIndicator();

      // Get the text response from the appropriate field
      const aiTextResponse =
        data.response || data.message || "Sorry, I don't have a response.";

      // Process text to extract and clean URLs
      const processedResponse = this.extractAndCleanUrls(aiTextResponse);
      const cleanedTextResponse = processedResponse.text;
      const extractedUrls = processedResponse.urls;

      // Add AI message to chat with the cleaned text
      this.addMessage(cleanedTextResponse, "ai", true);

      // Store thread ID
      if (data.threadId && VoiceroCore) {
        VoiceroCore.currentThreadId = data.threadId;
      }

      // Store in app state if core is available
      if (VoiceroCore) {
        VoiceroCore.appState.messages.push({
          role: "user",
          content: message,
        });
        VoiceroCore.appState.messages.push({
          role: "assistant",
          content: cleanedTextResponse, // Store cleaned response
        });
        VoiceroCore.saveState();
      }

      // After a short delay, redirect to the first URL if one exists
      if (extractedUrls.length > 0) {
        setTimeout(() => {
          this.redirectToUrl(extractedUrls[0]);
        }, 1500);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // Remove typing indicator
      this.removeTypingIndicator();
      // Add error message
      this.addMessage(
        "Sorry, I encountered an error. Please try again later.",
        "ai",
      );
    } finally {
      // End loading state
      this.setLoading(false);
    }
  },

  // Start a visibility guard to ensure the interface stays visible
  startVisibilityGuard: function () {
    console.log("Starting visibility guard for Shadow DOM interface");
    // Clear any existing guard interval
    if (this.visibilityGuardInterval) {
      clearInterval(this.visibilityGuardInterval);
    }
    // Set up interval to periodically check visibility
    this.visibilityGuardInterval = setInterval(() => {
      this.ensureChatVisibility();
    }, 2000); // Check every 2 seconds

    // Also check once right away
    setTimeout(() => {
      this.ensureChatVisibility();
    }, 300);

    // Make sure the interval is cleared when the page is unloaded
    window.addEventListener("beforeunload", () => {
      if (this.visibilityGuardInterval) {
        clearInterval(this.visibilityGuardInterval);
      }
    });
  },

  // Function to ensure the chat interface stays visible
  ensureChatVisibility: function () {
    const shadowHost = document.getElementById("voicero-shadow-host");
    if (!shadowHost) {
      console.log("Shadow host not found, cannot check visibility");
      return;
    }
    // Check if shadow host is visible
    const style = window.getComputedStyle(shadowHost);
    const isHidden =
      style.display === "none" || parseFloat(style.opacity) < 0.1;

    if (isHidden) {
      console.log("Shadow host visibility compromised, restoring...");
      shadowHost.style.display = "block";
      shadowHost.style.opacity = "1";
    }

    // In our new approach, we need to ensure that:
    // 1. Input wrapper is always visible
    // 2. Messages container is visible only if not minimized

    if (this.shadowRoot) {
      const inputWrapper = this.shadowRoot.getElementById("chat-input-wrapper");
      if (inputWrapper) {
        const inputStyle = window.getComputedStyle(inputWrapper);
        if (
          inputStyle.display === "none" ||
          parseFloat(inputStyle.opacity) < 0.1
        ) {
          console.log("Input wrapper hidden, restoring...");
          inputWrapper.style.display = "block";
          inputWrapper.style.opacity = "1";
          if (VoiceroCore && VoiceroCore.appState.isTextMinimized) {
            inputWrapper.style.borderRadius = "12px";
            inputWrapper.style.marginTop = "10px";
          }
        }
      }
      // Only check messages container if not minimized
      if (VoiceroCore && !VoiceroCore.appState.isTextMinimized) {
        const messagesContainer =
          this.shadowRoot.getElementById("chat-messages");
        if (messagesContainer) {
          const messageStyle = window.getComputedStyle(messagesContainer);
          if (
            messageStyle.display === "none" ||
            parseFloat(messageStyle.opacity) < 0.1
          ) {
            console.log(
              "Messages container hidden but should be visible, restoring...",
            );
            messagesContainer.style.display = "block";
            messagesContainer.style.opacity = "1";
          }
          // Only check if initial suggestions should be visible if no user messages
          const hasUserMessage =
            VoiceroCore &&
            VoiceroCore.appState &&
            VoiceroCore.appState.hasUserMessage;
          const userMessages =
            messagesContainer.querySelectorAll(".user-message");
          if (userMessages.length === 0 && !hasUserMessage) {
            const initialSuggestions = messagesContainer.querySelector(
              "#initial-suggestions",
            );
            if (initialSuggestions) {
              if (
                initialSuggestions.style.display === "none" ||
                parseFloat(
                  window.getComputedStyle(initialSuggestions).opacity,
                ) < 0.1
              ) {
                console.log(
                  "Initial suggestions hidden but should be visible, restoring...",
                );
                initialSuggestions.style.display = "block";
                initialSuggestions.style.opacity = "1";
              }
            }
          }
        }
      }
    }

    // Also ensure the maximize button is shown if chat is minimized
    if (VoiceroCore && VoiceroCore.appState.isTextMinimized) {
      const maximizeButton = this.shadowRoot
        ? this.shadowRoot.getElementById("maximize-chat")
        : document.getElementById("maximize-chat");

      if (maximizeButton) {
        const btnStyle = window.getComputedStyle(maximizeButton);
        if (
          btnStyle.display === "none" ||
          btnStyle.opacity === "0" ||
          parseFloat(btnStyle.opacity) < 0.5
        ) {
          console.log(
            "Maximize button hidden but should be visible, restoring...",
          );
          maximizeButton.style.position = "absolute";
          maximizeButton.style.display = "flex";
          maximizeButton.style.opacity = "1";
          maximizeButton.style.bottom = "60px";
          maximizeButton.style.right = "20px";
          maximizeButton.style.width = "32px";
          maximizeButton.style.height = "32px";
          maximizeButton.style.background = "white";
          maximizeButton.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.15)";
          maximizeButton.style.zIndex = "2147483647";
          maximizeButton.style.cursor = "pointer";
          maximizeButton.style.top = "auto"; // Clear any top property
          maximizeButton.style.transform = "none"; // Remove any transforms
        }
      } else {
        console.log("Maximize button not found, creating it");
        // If button doesn't exist, we could create it here
      }
    }
  },

  // Create an isolated iframe to host the chat interface
  createIsolatedChatFrame: function () {
    console.log("Creating Shadow DOM for chat interface");
    // First check if shadow host already exists
    let shadowHost = document.getElementById("voicero-shadow-host");
    if (shadowHost) {
      console.log("Shadow host already exists, will reuse it");
    } else {
      // Create shadow DOM host element
      shadowHost = document.createElement("div");
      shadowHost.id = "voicero-shadow-host";
      shadowHost.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        width: 80%;
        max-width: 960px;
        min-width: 280px;
        z-index: 2147483646; /* Maximum possible z-index value - 1 */
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        overflow: hidden;
      `;
      document.body.appendChild(shadowHost);
      console.log("Created new shadow host element");
    }

    // Create shadow root
    this.shadowRoot = shadowHost.attachShadow({ mode: "open" });
    console.log("Attached shadow root to host");

    // Add styles and HTML content to shadow root
    this.shadowRoot.innerHTML = `
      <style>
        /* Same styles as in createChatInterface, but inside shadow DOM */
        @keyframes gradientMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @keyframes gradientBorder {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .typing-indicator {
          display: flex !important;
          gap: 4px;
          padding: 8px 12px;
          background: #f0f0f0;
          border-radius: 12px;
          width: fit-content;
          opacity: 1 !important;
          margin-bottom: 0;
        }

        .typing-dot {
          width: 8px;
          height: 8px;
          background: #666;
          border-radius: 50%;
          animation: typingAnimation 1s infinite;
          opacity: 1;
        }

        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes typingAnimation {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-8px); }
        }

        .user-message {
          display: flex;
          justify-content: flex-end;
        }

        .user-message .message-content {
          background: #882be6;
          color: white;
          border-radius: 12px 12px 0 12px;
          padding: 10px 14px;
          max-width: 65%;
          word-wrap: break-word;
          font-size: 14px;
          line-height: 1.4;
        }

        .ai-message {
          display: flex;
          justify-content: flex-start;
        }

        .ai-message .message-content {
          background: #f0f0f0;
          color: #333;
          border-radius: 12px 12px 12px 0;
          padding: 10px 14px;
          max-width: 65%;
          word-wrap: break-word;
          font-size: 14px;
          line-height: 1.4;
        }

        .chat-link {
          color: #882be6;
          text-decoration: none;
          font-weight: 500;
          position: relative;
          transition: all 0.2s ease;
        }

        .chat-link:hover {
          text-decoration: underline;
          opacity: 0.9;
        }
      </style>

      <div id="chat-messages" style="
        background: white;
        border-radius: 12px 12px 0 0;
        padding: 15px;
        padding-top: 45px; /* Increased to make room for sticky header */
        margin-bottom: 0;
        max-height: 40vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        position: relative;
        transition: all 0.3s ease;
      ">
        <div id="chat-controls-header" style="
          position: sticky;
          top: 0;
          left: 0;
          right: 0;
          height: 36px;
          background: white;
          z-index: 10;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 5px 10px;
          border-bottom: 1px solid #f0f0f0;
          border-radius: 12px 12px 0 0;
          margin-bottom: 10px;
        ">
          <button
            id="close-chat"
            onclick="VoiceroText.closeTextChat()"
            style="
              position: absolute;
              top: 10px;
              right: 40px;
              background: none;
              border: none;
              cursor: pointer;
              padding: 5px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.2s ease;
              z-index: 1001;
            "
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
          <button
            id="minimize-chat"
            onclick="VoiceroText.minimizeChat()"
            style="
              position: absolute;
              top: 10px;
              right: 10px;
              background: none;
              border: none;
              cursor: pointer;
              padding: 5px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.2s ease;
              z-index: 1001;
            "
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round">
              <path d="M8 3h8m-8 18h8M4 8v8m16-8v8"/>
            </svg>
          </button>
          <button
            id="maximize-chat"
            onclick="VoiceroText.maximizeChat()"
            style="
              position: fixed;
              top: 0;
              right: 10px;
              background: white;
              border: none;
              cursor: pointer;
              padding: 8px;
              border-radius: 50%;
              display: none;
              align-items: center;
              justify-content: center;
              transition: all 0.2s ease;
              z-index: 2147483647;
              width: 32px;
              height: 32px;
              box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
              transform: translateY(-45px);
            "
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round">
              <path d="M8 3v18m8-18v18M4 8h16m-16 8h16"/>
            </svg>
          </button>
          <button
            id="clear-text-chat"
            onclick="VoiceroText.clearChatHistory()"
            style="
              position: relative;
              top: auto;
              left: auto;
              background: none;
              border: none;
              cursor: pointer;
              padding: 5px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.2s ease;
              z-index: 1001;
              background-color: #f0f0f0;
              font-size: 12px;
              color: #666;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            "
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" style="margin-right: 4px;">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Clear</span>
          </button>
        </div>
        <div id="loading-bar" style="
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
        "></div>

        <!-- Add initial suggestions directly in shadow DOM -->
        <div id="initial-suggestions" style="
          padding: 10px 0;
          opacity: 1;
          transition: all 0.3s ease;
        ">
          <div style="
            color: #666;
            font-size: 13px;
            margin-bottom: 10px;
            text-align: center;
          ">
            Try asking one of these questions:
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <!-- Suggestions will be populated from API -->
            <div class="suggestion" style="
              background: #882be6;
              padding: 8px 14px;
              border-radius: 8px;
              cursor: pointer;
              transition: all 0.2s ease;
              color: white;
              font-weight: 500;
              text-align: left;
              font-size: 13px;
            ">Loading suggestions...</div>
          </div>
        </div>
      </div>

      <div id="chat-input-wrapper" style="
        position: relative;
        padding: 2px;
        background: linear-gradient(90deg, #882be6, #ff4444, #882be6);
        background-size: 200% 100%;
        border-radius: 0 0 12px 12px;
        animation: gradientBorder 3s linear infinite;
      ">
        <div style="
          display: flex;
          align-items: center;
          background: white;
          border-radius: 0 0 12px 12px;
          padding: 5px;
        ">
          <input
            type="text"
            id="chat-input"
            placeholder="Ask me anything..."
            style="
              flex: 1;
              border: none;
              padding: 12px 20px;
              font-size: 16px;
              outline: none;
              background: transparent;
              border-radius: 50px;
            "
          >
          <button id="send-message-btn" style="
            background: #882be6;
            border: none;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            margin-right: 5px;
            transition: all 0.3s ease;
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
    console.log("Ensuring initial suggestions are visible in new interface");
    const initialSuggestions = this.shadowRoot.getElementById(
      "initial-suggestions",
    );
    if (initialSuggestions) {
      initialSuggestions.style.display = "block";
      initialSuggestions.style.opacity = "1";
    }

    console.log(
      "Checking if popup questions are already available to display in new interface",
    );
    if (
      this.websiteData &&
      this.websiteData.website &&
      this.websiteData.website.popUpQuestions
    ) {
      console.log("Popup questions available, updating in new interface");
      this.updatePopupQuestions();
    } else {
      console.log("No popup questions available yet for new interface");
    }

    console.log("Shadow DOM interface created successfully");
    return this.shadowRoot;
  },

  // Clear chat history
  clearChatHistory: function () {
    console.log("Clearing text chat history");
    // Clear localStorage message history
    localStorage.removeItem("voicero_text_message_history");

    // Also update the UI if the chat is currently open
    const messagesContainer = this.shadowRoot
      ? this.shadowRoot.getElementById("chat-messages")
      : document.getElementById("chat-messages");
    if (messagesContainer) {
      const existingMessages = messagesContainer.querySelectorAll(
        ".user-message, .ai-message",
      );
      existingMessages.forEach((el) => el.remove());
      // Reset height and padding after clearing
      messagesContainer.style.height = "auto";
      messagesContainer.style.paddingTop = "35px";

      // Show initial suggestions again
      const initialSuggestions = messagesContainer.querySelector(
        "#initial-suggestions",
      );
      if (initialSuggestions) {
        initialSuggestions.style.display = "block";
        initialSuggestions.style.opacity = "1";
        initialSuggestions.style.height = "auto";
        initialSuggestions.style.margin = "";
        initialSuggestions.style.padding = "";
        initialSuggestions.style.overflow = "visible";
      }
    }

    // Reset in VoiceroCore state if available
    if (VoiceroCore && VoiceroCore.appState) {
      VoiceroCore.appState.messages = [];
      VoiceroCore.appState.hasUserMessage = false;
      VoiceroCore.appState.textMessageHistory = []; // Reset text message history in state
      // We should also reset hasShownTextWelcome so the welcome message will show again on next open
      VoiceroCore.appState.hasShownTextWelcome = false;
      VoiceroCore.saveState();
    }
  },

  // Send chat message to API
  sendChatToApi: function (messageText, threadId) {
    console.log(`Sending message to API: ${messageText}`);
    if (!this.apiBaseUrl) {
      console.error("No API URL available, cannot send message");
      return Promise.reject("API URL not available");
    }

    // Show loading indicator
    this.setLoadingIndicator(true);

    // Get current URL to send as context
    const currentUrl = window.location.href;

    // Format the request body according to the API's expected structure
    const requestBody = {
      message: messageText,
      url: currentUrl,
      type: "text",
      source: "chat",
      context: {
        currentUrl: currentUrl,
        currentContent: document.body.innerText.substring(0, 1000), // snippet of page content
      },
    };

    // Add thread ID if available
    if (threadId) {
      requestBody.threadId = threadId;
    } else if (this.currentThreadId) {
      requestBody.threadId = this.currentThreadId;
    }

    // Add chat history if available
    if (this.messages && this.messages.length > 0) {
      requestBody.chatHistory = this.messages.map((msg) => ({
        role: msg.role,
        message: msg.content,
      }));
    }

    // Add custom instructions if available
    if (this.customInstructions) {
      requestBody.customInstructions = this.customInstructions;
    }

    console.log("Sending API request with body:", requestBody);

    return fetch(`${this.apiBaseUrl}/api/shopify/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.voiceroConfig.accessKey}`,
      },
      body: JSON.stringify(requestBody),
    });
  },

  // Create typing indicator for AI messages
  createTypingIndicator: function () {
    // Create typing indicator
    const typingIndicator = document.createElement("div");
    typingIndicator.className = "typing-indicator";
    typingIndicator.style.cssText = `
      display: flex;
      gap: 4px;
      padding: 8px 12px;
      background: #f0f0f0;
      border-radius: 12px;
      width: fit-content;
      margin-bottom: 10px;
    `;

    // Create typing dots
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("div");
      dot.className = "typing-dot";
      dot.style.cssText = `
        width: 8px;
        height: 8px;
        background: #666;
        border-radius: 50%;
        animation: typingAnimation 1s infinite;
      `;
      if (i === 1) dot.style.animationDelay = "0.2s";
      if (i === 2) dot.style.animationDelay = "0.4s";
      typingIndicator.appendChild(dot);
    }
    return typingIndicator;
  },

  // Set loading indicator state
  setLoadingIndicator: function (isLoading) {
    console.log("Setting loading indicator:", isLoading ? "visible" : "hidden");
    // Find loading bar in shadow DOM or regular DOM
    const getLoadingBar = () => {
      if (this.shadowRoot) {
        return this.shadowRoot.getElementById("loading-bar");
      }
      return document.getElementById("loading-bar");
    };
    const loadingBar = getLoadingBar();
    if (!loadingBar) {
      console.warn("Loading bar element not found");
      return;
    }

    if (isLoading) {
      // Show loading animation
      loadingBar.style.display = "block";
      loadingBar.style.width = "100%";
    } else {
      // Hide loading animation
      loadingBar.style.display = "none";
      loadingBar.style.width = "0%";
    }
  },

  // Send a chat message from the suggestion or input
  sendChatMessage: function (text) {
    console.log("sendChatMessage called with text:", text);
    // If no text provided, get from input field
    if (!text) {
      console.log("No text provided, getting from input field");
      if (this.shadowRoot) {
        const chatInput = this.shadowRoot.getElementById("chat-input");
        if (chatInput) {
          text = chatInput.value.trim();
          chatInput.value = "";
        }
      }
    }
    // Exit if no text to send
    if (!text || text.length === 0) {
      console.log("No text to send, exiting sendChatMessage");
      return;
    }
    console.log("Sending chat message:", text);

    // Add user message to UI
    this.addMessage(text, "user");

    // Hide suggestions if visible
    if (this.shadowRoot) {
      const suggestions = this.shadowRoot.getElementById("initial-suggestions");
      if (suggestions) {
        console.log("Hiding suggestions after message send");
        suggestions.style.display = "none";
      }
    }

    // Send message to API
    this.sendMessageToAPI(text);
  },

  // Send message to API (extracted for clarity)
  sendMessageToAPI: function (text) {
    console.log("Sending message to API:", text);
    // Set loading state
    this.isWaitingForResponse = true;

    // Show typing indicator
    const typingIndicator = this.createTypingIndicator();
    let typingWrapper = null;
    if (this.shadowRoot) {
      const messagesContainer = this.shadowRoot.getElementById("chat-messages");
      if (messagesContainer) {
        typingWrapper = document.createElement("div");
        typingWrapper.className = "ai-message typing-wrapper";
        typingWrapper.appendChild(typingIndicator);
        messagesContainer.appendChild(typingWrapper);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }

    // Function to remove typing indicator
    const removeTypingIndicator = () => {
      if (typingWrapper) {
        typingWrapper.remove();
      }
      const typingElements = document.querySelectorAll(".typing-wrapper");
      typingElements.forEach((el) => el.remove());
    };

    // Send to API
    if (this.sendChatToApi) {
      console.log("Calling sendChatToApi function");
      this.sendChatToApi(text)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          console.log("API response received:", data);
          // Turn off loading indicator
          this.setLoadingIndicator(false);
          // Remove typing indicator before showing response
          removeTypingIndicator();

          // Extract message
          let message =
            typeof data.response === "string"
              ? data.response
              : data.response || "I'm sorry, I couldn't process that request.";

          // Extract URLs
          const urlRegex =
            /(https?:\/\/[^\s]+|www\.[^\s]+|[^\s]+\.(com|org|net|io|co|shop|store|app)(\/?[^\s]*)?)/gi;
          const urls = message.match(urlRegex) || [];

          // If there's a product URL, do a redirect
          const productUrl = urls.find((url) => url.includes("/products/"));
          if (productUrl) {
            this.lastProductUrl = productUrl;
            // Redirect to the product page
            window.location.href = productUrl;
          }

          // Clean up URLs in the message
          message = message.replace(
            /check out (https?:\/\/[^\s]+|www\.[^\s]+|[^\s]+\.(com|org|net|io|co|shop|store|app)(\/?[^\s]*)?)/gi,
            "check it out",
          );
          message = message.replace(
            /at (https?:\/\/[^\s]+|www\.[^\s]+|[^\s]+\.(com|org|net|io|co|shop|store|app)(\/?[^\s]*)?)/gi,
            "here",
          );
          message = message.replace(
            /here: (https?:\/\/[^\s]+|www\.[^\s]+|[^\s]+\.(com|org|net|io|co|shop|store|app)(\/?[^\s]*)?)/gi,
            "here",
          );
          message = message.replace(
            /at this link: (https?:\/\/[^\s]+|www\.[^\s]+|[^\s]+\.(com|org|net|io|co|shop|store|app)(\/?[^\s]*)?)/gi,
            "here",
          );
          message = message.replace(
            /visit (https?:\/\/[^\s]+|www\.[^\s]+|[^\s]+\.(com|org|net|io|co|shop|store|app)(\/?[^\s]*)?)/gi,
            "visit this page",
          );
          message = message.replace(urlRegex, "this link");
          message = message.replace(/\s\s+/g, " ").trim();

          // Add AI response to chat
          this.addMessage(message, "ai");

          // Save the thread ID if provided
          if (data.threadId) {
            this.currentThreadId = data.threadId;
          }
          // Reset waiting state
          this.isWaitingForResponse = false;
        })
        .catch((error) => {
          console.error("Error sending message to API:", error);
          // Turn off loading indicator
          this.setLoadingIndicator(false);
          // Remove typing indicator
          removeTypingIndicator();
          // Add error message
          let errorMessage =
            "I'm sorry, there was an error processing your request. Please try again later.";
          if (error.message && error.message.includes("500")) {
            errorMessage =
              "I'm sorry, but there was a server error. The website's content might not be accessible currently. Please try again in a moment.";
          }
          this.addMessage(errorMessage, "ai");
          this.isWaitingForResponse = false;
        });
    } else {
      console.error("sendChatToApi function not found");
      // Turn off loading indicator
      this.setLoadingIndicator(false);
      // Remove typing indicator
      removeTypingIndicator();
      this.addMessage(
        "I'm sorry, I'm having trouble connecting to the server. Please try again later.",
        "ai",
      );
      this.isWaitingForResponse = false;
    }
  },

  // Send message from input field
  sendMessage: function () {
    console.log("sendMessage called");

    // Auto-maximize if minimized
    if (
      VoiceroCore &&
      VoiceroCore.appState &&
      VoiceroCore.appState.isTextMinimized
    ) {
      console.log("Chat is minimized, maximizing before sending message");
      this.maximizeChat();

      // Small delay to ensure UI is updated before continuing
      setTimeout(() => {
        this.sendMessageLogic();
      }, 200);
    } else {
      // Chat is already maximized, proceed normally
      this.sendMessageLogic();
    }
  },

  // Create a new helper function to contain the send logic
  sendMessageLogic: function () {
    // Forward to sendChatMessage to handle the logic
    if (this.shadowRoot) {
      const chatInput = this.shadowRoot.getElementById("chat-input");
      if (chatInput) {
        const text = chatInput.value.trim();
        chatInput.value = "";
        if (text.length > 0) {
          this.sendChatMessage(text);
        }
      }
    }
  },

  // Update the sendChatMessage function to auto-maximize
  sendChatMessage: function (text) {
    console.log("sendChatMessage called with text:", text);

    // Check if chat is minimized
    if (
      VoiceroCore &&
      VoiceroCore.appState &&
      VoiceroCore.appState.isTextMinimized
    ) {
      console.log("Chat is minimized, maximizing before sending message");
      this.maximizeChat();

      // Small delay to ensure UI is updated before continuing
      setTimeout(() => {
        this.sendChatMessageLogic(text);
      }, 200);
    } else {
      // Chat is already maximized, proceed normally
      this.sendChatMessageLogic(text);
    }
  },

  // Create a new helper function for sendChatMessage logic
  sendChatMessageLogic: function (text) {
    // If no text provided, get from input field
    if (!text) {
      console.log("No text provided, getting from input field");
      if (this.shadowRoot) {
        const chatInput = this.shadowRoot.getElementById("chat-input");
        if (chatInput) {
          text = chatInput.value.trim();
          chatInput.value = "";
        }
      }
    }
    // Exit if no text to send
    if (!text || text.length === 0) {
      console.log("No text to send, exiting sendChatMessage");
      return;
    }
    console.log("Sending chat message:", text);

    // Add user message to UI
    this.addMessage(text, "user");

    // Hide suggestions if visible
    if (this.shadowRoot) {
      const suggestions = this.shadowRoot.getElementById("initial-suggestions");
      if (suggestions) {
        console.log("Hiding suggestions after message send");
        suggestions.style.display = "none";
      }
    }

    // Send message to API
    this.sendMessageToAPI(text);
  },
};

// Initialize when core is ready
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOMContentLoaded event triggered for VoiceroText");
  // Check if VoiceroCore is already loaded
  if (typeof VoiceroCore !== "undefined") {
    console.log(
      "VoiceroCore is already available, initializing VoiceroText now",
    );
    VoiceroText.init();
  } else {
    // Wait for core to be available
    console.log("Waiting for VoiceroCore to become available...");
    const checkCoreInterval = setInterval(() => {
      if (typeof VoiceroCore !== "undefined") {
        console.log("VoiceroCore detected, initializing VoiceroText now");
        clearInterval(checkCoreInterval);
        VoiceroText.init();
      }
    }, 100);

    // Stop checking after 10 seconds
    setTimeout(() => {
      clearInterval(checkCoreInterval);
      console.error("VoiceroCore not available after 10 seconds");
      // Initialize anyway to at least have the interface elements ready
      console.log("Initializing VoiceroText without VoiceroCore");
      VoiceroText.init();
    }, 10000);
  }
});

// Expose global functions
window.VoiceroText = VoiceroText;

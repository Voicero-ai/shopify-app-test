/**
 * VoiceroAI Message Utilities
 * Shared message rendering functions used across Voicero modules
 */

const VoiceroMessage = {
  /**
   * Create a message element with proper styling
   * @param {string} text - Message content
   * @param {string} role - Either 'user' or 'ai'
   * @param {Object} options - Additional options (isLoading, isInitial, etc)
   * @returns {HTMLElement} The created message element
   */
  createMessageElement: function (text, role, options = {}) {
    if (!text) return null;

    const { isLoading = false, isInitial = false, messageId = null } = options;

    // Format message if needed for AI messages
    if (
      role === "ai" &&
      window.VoiceroCore &&
      window.VoiceroCore.formatMarkdown
    ) {
      text = window.VoiceroCore.formatMarkdown(text);
    }

    // Create message element
    const messageDiv = document.createElement("div");
    messageDiv.className = role === "user" ? "user-message" : "ai-message";

    // Add placeholder class if loading
    if (isLoading) {
      messageDiv.classList.add("placeholder");
    }

    // Generate a unique ID for this message if not provided
    const uniqueId = messageId || this.generateMessageId();
    messageDiv.dataset.messageId = uniqueId;

    // Create message content
    const contentDiv = document.createElement("div");
    contentDiv.className =
      role === "user" ? "message-content" : "voice-message-content";

    // Set the content (handle HTML for AI messages)
    if (role === "ai") {
      contentDiv.innerHTML = text;
    } else {
      contentDiv.textContent = text;
    }

    // Style based on message type
    if (isInitial) {
      contentDiv.style.background = "#e5e5ea";
      contentDiv.style.color = "#333";
      contentDiv.style.textAlign = "center";
      contentDiv.style.margin = "15px auto";
      contentDiv.style.width = "80%";
      contentDiv.style.borderRadius = "18px";
      messageDiv.style.justifyContent = "center";
    } else if (role === "user") {
      // Use theme color for user messages if available
      const themeColor =
        window.VoiceroColor && window.VoiceroCore
          ? window.VoiceroCore.websiteColor || "#882be6"
          : "#882be6";
      contentDiv.style.backgroundColor = themeColor;

      // Add delivery status for user messages
      const statusDiv = document.createElement("div");
      statusDiv.className = "read-status";
      statusDiv.textContent = "Delivered";
      messageDiv.appendChild(statusDiv);
    }

    // Append content to message
    messageDiv.appendChild(contentDiv);

    return messageDiv;
  },

  /**
   * Create a typing indicator element
   * @returns {HTMLElement} The typing indicator element
   */
  createTypingIndicator: function () {
    // Create typing indicator
    const typingIndicator = document.createElement("div");
    typingIndicator.className = "typing-indicator";
    typingIndicator.style.cssText = `
      display: flex;
      gap: 4px;
      padding: 8px 12px;
      background: #e5e5ea;
      border-radius: 18px;
      width: fit-content;
      margin-bottom: 10px;
      margin-left: 5px;
    `;

    // Create typing dots
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("div");
      dot.className = "typing-dot";
      dot.style.cssText = `
        width: 7px;
        height: 7px;
        background: #999999;
        border-radius: 50%;
        animation: typingAnimation 1s infinite;
      `;
      if (i === 1) dot.style.animationDelay = "0.2s";
      if (i === 2) dot.style.animationDelay = "0.4s";
      typingIndicator.appendChild(dot);
    }
    return typingIndicator;
  },

  /**
   * Process AI messages to add report buttons
   * @param {HTMLElement} messageElement - The message element to process
   * @param {string} chatType - Either 'text' or 'voice'
   */
  processAIMessage: function (messageElement, chatType) {
    if (!messageElement || !chatType) return;

    // Skip if already has a report button
    if (messageElement.querySelector(".voicero-report-button")) return;

    // Try to attach a report button using VoiceroSupport
    if (window.VoiceroSupport) {
      try {
        // Small delay to ensure the message is fully rendered
        setTimeout(() => {
          if (typeof window.VoiceroSupport.processAIMessage === "function") {
            window.VoiceroSupport.processAIMessage(messageElement, chatType);
          } else if (
            typeof window.VoiceroSupport.attachReportButtonToMessage ===
            "function"
          ) {
            window.VoiceroSupport.attachReportButtonToMessage(
              messageElement,
              chatType,
            );
          }
        }, 50);
      } catch (e) {
        console.error("Failed to attach report button:", e);
        this.addBasicReportButton(messageElement);
      }
    } else {
      // Fallback: Add a basic report button
      this.addBasicReportButton(messageElement);
    }
  },

  /**
   * Add a basic report button when VoiceroSupport isn't available
   * @param {HTMLElement} messageElement - The message element
   */
  addBasicReportButton: function (messageElement) {
    if (!messageElement) return;

    // Find the content container
    const contentContainer =
      messageElement.querySelector(".message-content") ||
      messageElement.querySelector(".voice-message-content");

    if (
      contentContainer &&
      !contentContainer.querySelector(".voicero-report-button")
    ) {
      const reportButton = document.createElement("div");
      reportButton.className = "voicero-report-button";
      reportButton.innerHTML = "Report an AI problem";
      reportButton.style.cssText = `
        font-size: 12px;
        color: #888;
        margin-top: 10px;
        text-align: right;
        cursor: pointer;
        text-decoration: underline;
        display: block;
        opacity: 0.8;
      `;
      contentContainer.appendChild(reportButton);
    }
  },

  /**
   * Generate a message ID for a new message
   * @returns {string} A unique message ID
   */
  generateMessageId: function () {
    return "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  },

  /**
   * Update message status indicators (e.g., from "Delivered" to "Read")
   * @param {HTMLElement} container - The messages container
   * @param {string} themeColor - The theme color to use for "Read" status
   */
  updateMessageStatusIndicators: function (container, themeColor) {
    if (!container) return;

    const userStatusDivs = container.querySelectorAll(".read-status");
    userStatusDivs.forEach((div) => {
      div.textContent = "Read";
      div.style.color = themeColor || "#882be6";
    });
  },
};

// Make message utilities available globally
window.VoiceroMessage = VoiceroMessage;

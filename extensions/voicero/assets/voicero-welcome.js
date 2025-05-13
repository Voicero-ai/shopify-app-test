/**
 * VoiceroAI Welcome Message Module
 * Handles welcome message generation and styling for voice and text interfaces
 */

const VoiceroWelcome = {
  /**
   * Generate welcome message HTML for different interfaces
   * @param {string} type - 'voice' or 'text' interface type
   * @param {string} websiteColor - The theme color for the website
   * @returns {string} HTML content for the welcome message
   */
  generateWelcomeMessage: function (type, websiteColor) {
    // Define default color if not provided
    const mainColor = websiteColor || "#882be6";

    // Add the pulse animation style
    const styleTag = document.createElement("style");
    styleTag.textContent = `
      @keyframes welcomePulse {
        0% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.3); opacity: 0.7; }
        100% { transform: scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(styleTag);

    // Common inline styles for welcome message components
    const styles = {
      welcomeMessage: `
        width: 90%; 
        max-width: 400px; 
        padding: 30px 15px; 
        margin: 15px auto; 
        text-align: center; 
        background: linear-gradient(135deg, #f5f7fa 0%, #e6e9f0 100%); 
        border-radius: 18px; 
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08); 
        position: relative; 
        overflow: hidden; 
        border: 1px solid rgba(${parseInt(mainColor.slice(1, 3), 16)}, 
                               ${parseInt(mainColor.slice(3, 5), 16)}, 
                               ${parseInt(mainColor.slice(5, 7), 16)}, 0.1);
        min-height: 180px;
        height: auto;
        box-sizing: border-box;
        display: block;
        float: none;
      `,
      welcomeTitle: `
        font-size: 18px;
        font-weight: 700;
        margin-bottom: 15px;
        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
        background: linear-gradient(90deg, ${mainColor}, ${mainColor});
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        letter-spacing: 0.5px;
        line-height: 1.4;
        height: auto;
        padding: 0;
      `,
      welcomeSubtitle: `
        font-size: 16px;
        line-height: 1.4;
        color: #666;
        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
        margin-bottom: 15px;
      `,
      welcomeHighlight: `
        color: ${mainColor};
        font-weight: 600;
      `,
      welcomeNote: `
        font-size: 14px;
        opacity: 0.75;
        font-style: italic;
        margin-top: 15px;
        color: #888;
        line-height: 1.4;
      `,
      welcomePulse: `
        display: inline-block;
        width: 10px;
        height: 10px;
        background-color: ${mainColor};
        border-radius: 50%;
        margin-right: 5px;
        animation: welcomePulse 1.5s infinite;
      `,
    };

    // Determine subtitle and note text based on interface type
    let subtitleText, noteText;

    if (type === "voice" || type === "voice-compact") {
      subtitleText =
        'Click mic & <span class="welcome-highlight" style="' +
        styles.welcomeHighlight +
        '">start talking</span>';
      noteText = "Button glows during conversation";
    } else {
      subtitleText =
        'Ask me questions or <span class="welcome-highlight" style="' +
        styles.welcomeHighlight +
        '">start typing</span>';
      noteText = "Ask me about this website or store";
    }

    // Use a single template for both interface types
    return `
      <div class="welcome-message" style="${styles.welcomeMessage}">
        <div class="welcome-title" style="${styles.welcomeTitle}">Aura, your website concierge</div>
        <div class="welcome-subtitle" style="${styles.welcomeSubtitle}">${subtitleText}</div>
        <div class="welcome-note" style="${styles.welcomeNote}"><span class="welcome-pulse" style="${styles.welcomePulse}"></span>${noteText}</div>
      </div>
    `;
  },

  /**
   * Force consistent styling on all welcome message elements
   * This method is called by both voice and text interfaces to ensure styling remains consistent
   */
  forceWelcomeMessageStyling: function () {
    // Find all welcome message elements in the document
    const welcomeMessages = document.querySelectorAll(".welcome-message");
    const mainColor = window.voiceroConfig?.websiteColor || "#882be6";

    // Apply consistent styling to all welcome messages
    welcomeMessages.forEach((msg) => {
      // Base container styling
      msg.style.width = "90%";
      msg.style.maxWidth = "400px";
      msg.style.padding = "30px 15px";
      msg.style.margin = "15px auto";
      msg.style.textAlign = "center";
      msg.style.background =
        "linear-gradient(135deg, #f5f7fa 0%, #e6e9f0 100%)";
      msg.style.borderRadius = "18px";
      msg.style.boxShadow = "0 4px 15px rgba(0, 0, 0, 0.08)";
      msg.style.position = "relative";
      msg.style.overflow = "hidden";
      msg.style.border = "none";
      msg.style.minHeight = "180px";
      msg.style.height = "auto";
      msg.style.boxSizing = "border-box";
      msg.style.display = "block";
      msg.style.float = "none";

      // Title styling
      const title = msg.querySelector(".welcome-title");
      if (title) {
        title.style.fontSize = "18px";
        title.style.fontWeight = "700";
        title.style.marginBottom = "15px";
        title.style.fontFamily =
          "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif";
        title.style.background = `linear-gradient(90deg, ${mainColor}, ${mainColor})`;
        title.style.webkitBackgroundClip = "text";
        title.style.backgroundClip = "text";
        title.style.webkitTextFillColor = "transparent";
        title.style.letterSpacing = "0.5px";
        title.style.lineHeight = "1.4";
        title.style.height = "auto";
        title.style.padding = "0";
      }

      // Subtitle styling
      const subtitle = msg.querySelector(".welcome-subtitle");
      if (subtitle) {
        subtitle.style.fontSize = "16px";
        subtitle.style.lineHeight = "1.4";
        subtitle.style.color = "#666";
        subtitle.style.fontFamily =
          "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif";
        subtitle.style.marginBottom = "15px";
      }

      // Highlight styling
      const highlights = msg.querySelectorAll(".welcome-highlight");
      highlights.forEach((highlight) => {
        highlight.style.color = mainColor;
        highlight.style.fontWeight = "600";
      });

      // Note styling
      const note = msg.querySelector(".welcome-note");
      if (note) {
        note.style.fontSize = "14px";
        note.style.opacity = "0.75";
        note.style.fontStyle = "italic";
        note.style.marginTop = "15px";
        note.style.color = "#888";
        note.style.lineHeight = "1.4";
      }

      // Pulse styling
      const pulse = msg.querySelector(".welcome-pulse");
      if (pulse) {
        pulse.style.display = "inline-block";
        pulse.style.width = "10px";
        pulse.style.height = "10px";
        pulse.style.backgroundColor = mainColor;
        pulse.style.borderRadius = "50%";
        pulse.style.marginRight = "5px";
        pulse.style.animation = "welcomePulse 1.5s infinite";
      }
    });
  },

  /**
   * Force consistent height on welcome messages for voice interface
   * This is needed to ensure proper layout in voice mode
   */
  forceWelcomeMessageHeight: function () {
    const welcomeMessages = document.querySelectorAll(".welcome-message");
    welcomeMessages.forEach((msg) => {
      msg.style.minHeight = "180px";
      msg.style.height = "auto";
    });
  },
};

// Expose to global scope
window.VoiceroWelcome = VoiceroWelcome;

/**
 * VoiceroAI Page Data Utilities
 * Shared page data collection functions used across Voicero modules
 */

const VoiceroPageData = {
  /**
   * Collect page data for better context
   * @returns {Object} Page data including text, buttons, forms, sections, and images
   */
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

      // Check if element.id is a string before calling toLowerCase()
      const id =
        typeof element.id === "string"
          ? element.id.toLowerCase()
          : String(element.id).toLowerCase();

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

  /**
   * Get past context from messages for chat requests
   * @param {Array} messages - Array of message objects
   * @returns {Array} Array of message objects formatted for API request
   */
  formatPastContext: function (messages) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return [];
    }

    // Get last 5 user questions and last 5 AI responses
    const userMessages = messages
      .filter((msg) => msg.role === "user")
      .slice(-5);

    const aiMessages = messages
      .filter((msg) => msg.role === "assistant")
      .slice(-5);

    // Combine all messages in chronological order
    const lastMessages = [...userMessages, ...aiMessages].sort((a, b) => {
      // Use createdAt if available, otherwise use order in array
      if (a.createdAt && b.createdAt) {
        return new Date(a.createdAt) - new Date(b.createdAt);
      }
      return messages.indexOf(a) - messages.indexOf(b);
    });

    // Format for API
    return lastMessages.map((msg) => {
      if (msg.role === "user") {
        return {
          question: msg.content,
          role: "user",
          createdAt: msg.createdAt || new Date().toISOString(),
          pageUrl: msg.pageUrl || window.location.href,
          id: msg.id || this.generateId(),
          threadId: msg.threadId,
        };
      } else {
        return {
          answer: msg.content,
          role: "assistant",
          createdAt: msg.createdAt || new Date().toISOString(),
          id: msg.id || this.generateId(),
          threadId: msg.threadId,
        };
      }
    });
  },

  /**
   * Generate a temporary ID for messages
   * @returns {string} A temporary ID
   */
  generateId: function () {
    return (
      "temp-" +
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  },
};

// Make page data utilities available globally
window.VoiceroPageData = VoiceroPageData;

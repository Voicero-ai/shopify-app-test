/**
 * VoiceroAI Chooser Module
 *
 * This module handles the interaction chooser UI element that presents options
 * for voice or text interaction with the Voicero assistant.
 */

(function (window, document) {
  // Create a minimal jQuery-like fallback when jQuery is not available
  const $ =
    window.jQuery ||
    function (selector) {
      // Return a simple object that implements a ready method
      return {
        ready: function (fn) {
          if (document.readyState !== "loading") {
            setTimeout(fn, 0);
          } else {
            document.addEventListener("DOMContentLoaded", fn);
          }
        },
      };
    };

  const VoiceroChooser = {
    /**
     * Show the chooser interface
     */
    showChooser: function () {
      console.log("VoiceroChooser: showChooser called");

      // Get access to core for session information
      const core = window.VoiceroCore;
      if (!core) {
        console.error(
          "VoiceroChooser: Cannot show chooser - VoiceroCore not available",
        );
        return;
      }

      // Check if suppressChooser is true and immediately return
      if (core.session && core.session.suppressChooser) {
        console.log(
          "VoiceroChooser: suppressChooser is true, not showing chooser",
        );
        return;
      }

      // Clear any existing choosers to prevent duplicates
      const allChoosers = document.querySelectorAll("#interaction-chooser");
      console.log(
        "VoiceroChooser: Found " + allChoosers.length + " chooser elements",
      );

      if (allChoosers.length > 1) {
        console.log(
          "VoiceroChooser: Removing " +
            (allChoosers.length - 1) +
            " duplicate choosers",
        );
        // Remove all but the last one
        for (let i = 0; i < allChoosers.length - 1; i++) {
          if (allChoosers[i] && allChoosers[i].parentNode) {
            allChoosers[i].parentNode.removeChild(allChoosers[i]);
          }
        }
      }

      // Check if the chooser exists and is already visible
      const existingChooser = document.getElementById("interaction-chooser");
      if (existingChooser) {
        console.log(
          "VoiceroChooser: Ensuring chooser is refreshed for consistent behavior",
        );
        // Always remove existing chooser to create a fresh one
        if (existingChooser.parentNode) {
          existingChooser.parentNode.removeChild(existingChooser);
        }
      }

      // Create a new chooser to ensure it's fresh
      this.createChooser();

      const chooser = document.getElementById("interaction-chooser");
      if (chooser) {
        console.log("VoiceroChooser: Setting chooser to visible");

        // FORCE VISIBILITY WITH DIRECT ATTRIBUTE SETTING
        chooser.setAttribute(
          "style",
          "position: fixed !important;" +
            "bottom: 80px !important;" +
            "right: 20px !important;" +
            "z-index: 10001 !important;" +
            "background-color: #c8c8c8 !important;" +
            "border-radius: 12px !important;" +
            "box-shadow: 6px 6px 0 " +
            (core.websiteColor || "#882be6") +
            " !important;" +
            "padding: 15px !important;" +
            "width: 280px !important;" +
            "border: 1px solid rgb(0, 0, 0) !important;" +
            "display: flex !important;" +
            "visibility: visible !important;" +
            "opacity: 1 !important;" +
            "flex-direction: column !important;" +
            "align-items: center !important;" +
            "margin: 0 !important;" +
            "transform: none !important;",
        );

        // Make sure the buttons are properly styled
        const voiceButton = document.getElementById("voice-chooser-button");
        const textButton = document.getElementById("text-chooser-button");

        if (voiceButton) {
          console.log("VoiceroChooser: Fixing voice button style");

          voiceButton.setAttribute(
            "style",
            "position: relative !important;" +
              "display: flex !important;" +
              "align-items: center !important;" +
              "padding: 10px 10px !important;" +
              "margin-bottom: 10px !important;" +
              "margin-left: -30px !important;" +
              "cursor: pointer !important;" +
              "border-radius: 8px !important;" +
              "background-color: white !important;" +
              "border: 1px solid rgb(0, 0, 0) !important;" +
              "box-shadow: 4px 4px 0 rgb(0, 0, 0) !important;" +
              "transition: all 0.2s ease !important;" +
              "width: 200px !important;",
          );
        }

        if (textButton) {
          console.log("VoiceroChooser: Fixing text button style");

          textButton.setAttribute(
            "style",
            "position: relative !important;" +
              "display: flex !important;" +
              "align-items: center !important;" +
              "padding: 10px 10px !important;" +
              "margin-left: -30px !important;" +
              "cursor: pointer !important;" +
              "border-radius: 8px !important;" +
              "background-color: white !important;" +
              "border: 1px solid rgb(0, 0, 0) !important;" +
              "box-shadow: 4px 4px 0 rgb(0, 0, 0) !important;" +
              "transition: all 0.2s ease !important;" +
              "width: 200px !important;",
          );
        }

        // Check the final computed style
        const computedStyle = window.getComputedStyle(chooser);
        console.log(
          "VoiceroChooser: FINAL chooser display:",
          computedStyle.display,
        );
        console.log(
          "VoiceroChooser: FINAL chooser visibility:",
          computedStyle.visibility,
        );
        console.log(
          "VoiceroChooser: FINAL chooser opacity:",
          computedStyle.opacity,
        );
        console.log(
          "VoiceroChooser: FINAL chooser flexDirection:",
          computedStyle.flexDirection,
        );
      } else {
        console.log(
          "VoiceroChooser: CRITICAL ERROR: Chooser not found in DOM after creation",
        );
      }
    },

    /**
     * Create the interaction chooser with consistent HTML and styles
     */
    createChooser: function () {
      console.log("VoiceroChooser: createChooser called");

      // Get access to core for website color
      const core = window.VoiceroCore;
      if (!core) {
        console.error(
          "VoiceroChooser: Cannot create chooser - VoiceroCore not available",
        );
        return;
      }

      // Remove any existing chooser
      const oldChooser = document.getElementById("interaction-chooser");
      if (oldChooser && oldChooser.parentNode) {
        console.log("VoiceroChooser: Removing old chooser");
        oldChooser.parentNode.removeChild(oldChooser);
      }

      const themeColor = core.websiteColor || "#882be6";
      console.log("VoiceroChooser: Using theme color:", themeColor);

      const buttonContainer = document.getElementById("voice-toggle-container");
      if (!buttonContainer) {
        console.log(
          "VoiceroChooser: CRITICAL ERROR: Button container not found",
        );
        return;
      }

      console.log("VoiceroChooser: Creating fresh chooser HTML");

      // Insert the HTML
      buttonContainer.insertAdjacentHTML(
        "beforeend",
        `<div
          id="interaction-chooser"
          style="
            position: fixed !important;
            bottom: 80px !important;
            right: 20px !important;
            z-index: 10001 !important;
            background-color: #c8c8c8 !important;
            border-radius: 12px !important;
            box-shadow: 6px 6px 0 ${themeColor} !important;
            padding: 15px !important;
            width: 280px !important;
            border: 1px solid rgb(0, 0, 0) !important;
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            flex-direction: column !important;
            align-items: center !important;
            margin: 0 !important;
            transform: none !important;
          "
        >
          <div
            id="voice-chooser-button"
            class="interaction-option voice"
            style="
              position: relative;
              display: flex;
              align-items: center;
              padding: 10px 10px;
              margin-bottom: 10px;
              margin-left: -30px;
              cursor: pointer;
              border-radius: 8px;
              background-color: white;
              border: 1px solid rgb(0, 0, 0);
              box-shadow: 4px 4px 0 rgb(0, 0, 0);
              transition: all 0.2s ease;
              width: 200px;
            "
          >
            <span style="font-weight: 700; color: rgb(0, 0, 0); font-size: 16px; width: 100%; text-align: center; white-space: nowrap;">
              Voice Conversation
            </span>
            <svg width="35" height="35" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" style="position: absolute; right: -50px; width: 35px; height: 35px;">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <path d="M12 19v4"/>
              <path d="M8 23h8"/>
            </svg>
          </div>

          <div
            id="text-chooser-button"
            class="interaction-option text"
            style="
              position: relative;
              display: flex;
              align-items: center;
              padding: 10px 10px;
              margin-left: -30px;
              cursor: pointer;
              border-radius: 8px;
              background-color: white;
              border: 1px solid rgb(0, 0, 0);
              box-shadow: 4px 4px 0 rgb(0, 0, 0);
              transition: all 0.2s ease;
              width: 200px;
            "
          >
            <span style="font-weight: 700; color: rgb(0, 0, 0); font-size: 16px; width: 100%; text-align: center;">
              Message
            </span>
            <svg width="35" height="35" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" style="position: absolute; right: -50px; width: 35px; height: 35px;">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          
          <div style="
            text-align: center;
            margin-top: 18px;
            line-height: 1;
          ">
            <div style="
              font-size: 10px;
              color: black;
              opacity: 0.8;
              margin-bottom: 2px;
            ">Powered by Voicero</div>
            <div style="
              font-size: 8px;
              color: black;
              opacity: 0.6;
            ">Voicero AI can make mistakes</div>
          </div>
        </div>`,
      );

      // Check that chooser was created
      const newChooser = document.getElementById("interaction-chooser");
      if (newChooser) {
        console.log("VoiceroChooser: New chooser created successfully");
      } else {
        console.log("VoiceroChooser: CRITICAL ERROR: Failed to create chooser");
        return;
      }

      // Add click handlers to the new options
      const chooser = document.getElementById("interaction-chooser");
      const container = document.getElementById("voicero-app-container");
      const voiceButton = document.getElementById("voice-chooser-button");
      if (voiceButton) {
        console.log("VoiceroChooser: Adding voice button click handler");

        // Remove any existing listeners first
        const newVoiceButton = voiceButton.cloneNode(true);
        if (voiceButton.parentNode) {
          voiceButton.parentNode.replaceChild(newVoiceButton, voiceButton);
        }

        newVoiceButton.addEventListener("click", () => {
          console.log("VoiceroChooser: Voice button clicked");

          // Hide the chooser
          if (chooser) {
            chooser.style.display = "none";
            chooser.style.visibility = "hidden";
            chooser.style.opacity = "0";
          }

          // JUST call openVoiceChat - it handles everything
          if (window.VoiceroVoice && window.VoiceroVoice.openVoiceChat) {
            window.VoiceroVoice.openVoiceChat();
          }
        });
      } else {
        console.log("VoiceroChooser: Voice button not found after creation");
      }

      const textButton = document.getElementById("text-chooser-button");
      if (textButton) {
        console.log("VoiceroChooser: Adding text button click handler");

        // Remove any existing listeners first
        const newTextButton = textButton.cloneNode(true);
        if (textButton.parentNode) {
          textButton.parentNode.replaceChild(newTextButton, textButton);
        }

        newTextButton.addEventListener("click", () => {
          console.log("VoiceroChooser: Text button clicked");

          // Hide the chooser
          if (chooser) {
            chooser.style.display = "none";
            chooser.style.visibility = "hidden";
            chooser.style.opacity = "0";
          }

          // JUST call openTextChat - it handles everything
          if (window.VoiceroText && window.VoiceroText.openTextChat) {
            window.VoiceroText.openTextChat();
          }
        });
      } else {
        console.log("VoiceroChooser: Text button not found after creation");
      }

      console.log("VoiceroChooser: Chooser creation complete");
    },

    /**
     * Helper to determine if the chooser should be displayed
     */
    shouldShowChooser: function () {
      console.log("VoiceroChooser: shouldShowChooser called");

      // Get access to core for session information
      const core = window.VoiceroCore;
      if (!core) {
        console.error(
          "VoiceroChooser: Cannot check chooser visibility - VoiceroCore not available",
        );
        return false;
      }

      console.log("VoiceroChooser: Session exists:", !!core.session);
      console.log("VoiceroChooser: Session state:", core.session);

      // Don't show if session doesn't exist
      if (!core.session) {
        console.log("VoiceroChooser: No session, not showing chooser");
        return false;
      }

      // Check if chooserOpen flag is explicitly set to true
      if (core.session.chooserOpen === true) {
        console.log("VoiceroChooser: chooserOpen is true, showing chooser");
        return true;
      }

      // Check if chooserOpen flag is explicitly set to false
      if (core.session.chooserOpen === false) {
        console.log(
          "VoiceroChooser: chooserOpen is false, not showing chooser",
        );
        return false;
      }

      // Don't show if any interfaces are open
      if (core.session.voiceOpen === true || core.session.textOpen === true) {
        console.log("VoiceroChooser: Interface is open, not showing chooser");
        return false;
      }

      // Don't show unless coreOpen is explicitly true and chooser isn't suppressed
      if (
        core.session.coreOpen !== true ||
        core.session.suppressChooser === true
      ) {
        console.log(
          "VoiceroChooser: coreOpen is not true or chooser is suppressed, not showing chooser",
        );
        return false;
      }

      // Check if interfaces are open in the DOM regardless of session state
      const textInterface = document.getElementById(
        "voicero-text-chat-container",
      );
      if (
        textInterface &&
        window.getComputedStyle(textInterface).display === "block"
      ) {
        console.log(
          "VoiceroChooser: Text interface is visible in DOM, not showing chooser",
        );
        return false;
      }

      const voiceInterface = document.getElementById("voice-chat-interface");
      if (
        voiceInterface &&
        window.getComputedStyle(voiceInterface).display === "block"
      ) {
        console.log(
          "VoiceroChooser: Voice interface is visible in DOM, not showing chooser",
        );
        return false;
      }

      console.log("VoiceroChooser: All checks passed, should show chooser");
      return true;
    },

    /**
     * Hide the chooser interface
     */
    hideChooser: function () {
      const chooser = document.getElementById("interaction-chooser");

      // Always hide the chooser, regardless of current state
      if (chooser) {
        console.log("VoiceroChooser: Hiding chooser UI unconditionally");
        chooser.style.display = "none";
        chooser.style.visibility = "hidden";
        chooser.style.opacity = "0";
      }
    },
  };

  // Expose the module globally
  window.VoiceroChooser = VoiceroChooser;
})(window, document);

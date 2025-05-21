/**
 * Voicero Return Handler
 * Handles returns, refunds, exchanges, and cancellations for Shopify orders
 */

const VoiceroReturnHandler = {
  config: {
    proxyUrl: "/apps/proxy",
    defaultHeaders: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    debug: true,
  },

  /**
   * Initialize the handler with custom configuration
   * @param {Object} userConfig - Custom configuration to override defaults
   * @returns {Object} - The handler instance for chaining
   */
  init: function (userConfig = {}) {
    this.config = {
      ...this.config,
      ...userConfig,
      defaultHeaders: {
        ...this.config.defaultHeaders,
        ...(userConfig.defaultHeaders || {}),
      },
    };

    if (this.config.debug) {
      console.log("VoiceroReturnHandler initialized with config:", this.config);
    }

    return this;
  },

  /**
   * Handle a refund request - requires order number and email
   * @param {Object} context - The context object with order details
   * @returns {Promise} - A promise that resolves when the refund is processed
   */
  handleRefund: async function (context) {
    console.log("Processing refund request:", context);
    const { order_id, order_number, email } = context || {};

    // Check if we have the required information
    if (!order_id && !order_number) {
      this.notifyUser(
        "To process a refund, I need your order number. Please provide it.",
      );
      return;
    }

    if (!email) {
      this.notifyUser(
        "To verify your identity for the refund, I need the email address used when placing the order.",
      );
      return;
    }

    // Check if user is logged in
    const isLoggedIn = this.checkUserLoggedIn();
    if (!isLoggedIn) {
      this.notifyUser(
        "You need to be logged into your account to request a refund. Please log in first.",
      );
      return;
    }

    // Verify order belongs to user
    if (!(await this.verifyOrderOwnership(order_id || order_number, email))) {
      this.notifyUser(
        "I couldn't verify that this order belongs to your account. Please check the order number and email address.",
      );
      return;
    }

    this.notifyUser(
      "I'm processing your refund request. This may take a moment...",
    );

    // Try to process the refund through the proxy
    try {
      const response = await this.callProxy("refund", {
        order_id: order_id || order_number,
        email,
        refund_type: "full", // Default to full refund
        reason: context.reason || "Customer requested",
      });

      if (response.success) {
        this.notifyUser(
          `✅ Your refund for order #${order_id || order_number} has been processed successfully! You should receive a confirmation email shortly.`,
        );
      } else {
        this.notifyUser(
          `❌ I couldn't process your refund automatically: ${response.error || "Unknown error"}. Please contact customer support for assistance.`,
        );
      }
    } catch (error) {
      console.error("Refund processing error:", error);
      this.notifyUser(
        "There was a problem processing your refund request. Please contact customer support directly for assistance.",
      );
    }
  },

  /**
   * Handle an order cancellation request
   * @param {Object} context - The context object with order details
   * @returns {Promise} - A promise that resolves when the cancellation is processed
   */
  handleCancelOrder: async function (context) {
    console.log("Processing order cancellation request:", context);
    const { order_id, order_number, email } = context || {};

    // Check if we have the required information
    if (!order_id && !order_number) {
      this.notifyUser(
        "To cancel an order, I need your order number. Please provide it.",
      );
      return;
    }

    if (!email) {
      this.notifyUser(
        "To verify your identity for the cancellation, I need the email address used when placing the order.",
      );
      return;
    }

    // Check if user is logged in
    const isLoggedIn = this.checkUserLoggedIn();
    if (!isLoggedIn) {
      this.notifyUser(
        "You need to be logged into your account to cancel an order. Please log in first.",
      );
      return;
    }

    // Verify order belongs to user
    if (!(await this.verifyOrderOwnership(order_id || order_number, email))) {
      this.notifyUser(
        "I couldn't verify that this order belongs to your account. Please check the order number and email address.",
      );
      return;
    }

    this.notifyUser(
      "I'm processing your cancellation request. This may take a moment...",
    );

    // Try to process the cancellation through the proxy
    try {
      const response = await this.callProxy("cancel", {
        order_id: order_id || order_number,
        email,
        reason: context.reason || "CUSTOMER",
        notify_customer: true,
        refund: true,
        restock: true,
      });

      if (response.success) {
        this.notifyUser(
          `✅ Your order #${order_id || order_number} has been cancelled successfully! You should receive a confirmation email shortly.`,
        );
      } else {
        this.notifyUser(
          `❌ I couldn't cancel your order automatically: ${response.error || "Unknown error"}. Please contact customer support for assistance.`,
        );
      }
    } catch (error) {
      console.error("Order cancellation error:", error);
      this.notifyUser(
        "There was a problem cancelling your order. Please contact customer support directly for assistance.",
      );
    }
  },

  /**
   * Handle a return request
   * @param {Object} context - The context object with order details
   * @returns {Promise} - A promise that resolves when the return is processed
   */
  handleReturn: async function (context) {
    console.log("Processing return request:", context);
    const { order_id, order_number, email, items } = context || {};

    // Check if we have the required information
    if (!order_id && !order_number) {
      this.notifyUser(
        "To process a return, I need your order number. Please provide it.",
      );
      return;
    }

    if (!email) {
      this.notifyUser(
        "To verify your identity for the return, I need the email address used when placing the order.",
      );
      return;
    }

    // Check if user is logged in
    const isLoggedIn = this.checkUserLoggedIn();
    if (!isLoggedIn) {
      this.notifyUser(
        "You need to be logged into your account to request a return. Please log in first.",
      );
      return;
    }

    // If we don't have specific items to return, we need to fetch the order first
    if (!items || !items.length) {
      this.notifyUser(
        "I need to know which items you want to return. Let me look up your order first.",
      );

      // Try to retrieve order details
      const orderDetails = await this.getOrderDetails(
        order_id || order_number,
        email,
      );
      if (!orderDetails) {
        this.notifyUser(
          "I couldn't find your order details. Please verify your order number and email.",
        );
        return;
      }

      // Ask user which items they want to return
      this.promptForReturnItems(orderDetails);
      return;
    }

    this.notifyUser(
      "I'm processing your return request. This may take a moment...",
    );

    // Try to process the return through the proxy
    try {
      const response = await this.callProxy("return", {
        order_id: order_id || order_number,
        email,
        items,
        reason: context.reason || "Customer dissatisfied",
      });

      if (response.success) {
        this.notifyUser(
          `✅ Your return for order #${order_id || order_number} has been initiated successfully! You should receive a confirmation email with next steps shortly.`,
        );
      } else {
        this.notifyUser(
          `❌ I couldn't process your return automatically: ${response.error || "Unknown error"}. Please contact customer support for assistance.`,
        );
      }
    } catch (error) {
      console.error("Return processing error:", error);
      this.notifyUser(
        "There was a problem processing your return request. Please contact customer support directly for assistance.",
      );
    }
  },

  /**
   * Handle an exchange request
   * @param {Object} context - The context object with order details
   * @returns {Promise} - A promise that resolves when the exchange is processed
   */
  handleExchange: async function (context) {
    console.log("Processing exchange request:", context);
    const { order_id, order_number, email, items } = context || {};

    // Check if we have the required information
    if (!order_id && !order_number) {
      this.notifyUser(
        "To process an exchange, I need your order number. Please provide it.",
      );
      return;
    }

    if (!email) {
      this.notifyUser(
        "To verify your identity for the exchange, I need the email address used when placing the order.",
      );
      return;
    }

    // Check if user is logged in
    const isLoggedIn = this.checkUserLoggedIn();
    if (!isLoggedIn) {
      this.notifyUser(
        "You need to be logged into your account to request an exchange. Please log in first.",
      );
      return;
    }

    // If we don't have specific items to exchange, we need to fetch the order first
    if (!items || !items.length) {
      this.notifyUser(
        "I need to know which items you want to exchange. Let me look up your order first.",
      );

      // Try to retrieve order details
      const orderDetails = await this.getOrderDetails(
        order_id || order_number,
        email,
      );
      if (!orderDetails) {
        this.notifyUser(
          "I couldn't find your order details. Please verify your order number and email.",
        );
        return;
      }

      // Ask user which items they want to exchange
      this.promptForExchangeItems(orderDetails);
      return;
    }

    this.notifyUser(
      "I'm processing your exchange request. This may take a moment...",
    );

    // Try to process the exchange through the proxy
    try {
      const response = await this.callProxy("exchange", {
        order_id: order_id || order_number,
        email,
        items,
        reason: context.reason || "Size/color exchange",
      });

      if (response.success) {
        this.notifyUser(
          `✅ Your exchange for order #${order_id || order_number} has been initiated successfully! You should receive a confirmation email with next steps shortly.`,
        );
      } else {
        this.notifyUser(
          `❌ I couldn't process your exchange automatically: ${response.error || "Unknown error"}. Please contact customer support for assistance.`,
        );
      }
    } catch (error) {
      console.error("Exchange processing error:", error);
      this.notifyUser(
        "There was a problem processing your exchange request. Please contact customer support directly for assistance.",
      );
    }
  },

  /**
   * Verify that the order belongs to the user with the given email
   * @param {string} orderNumber - The order ID or number
   * @param {string} email - The email to verify
   * @returns {Promise<boolean>} - True if the order belongs to the user
   */
  verifyOrderOwnership: async function (orderNumber, email) {
    // Check if we have injected customer data
    if (
      window.__VoiceroCustomerData &&
      window.__VoiceroCustomerData.recent_orders
    ) {
      const orders = window.__VoiceroCustomerData.recent_orders;

      // Find the order in the customer data
      const matchingOrder = orders.find(
        (o) =>
          o.order_number === orderNumber ||
          o.name === orderNumber ||
          o.name === `#${orderNumber}`,
      );

      if (matchingOrder) {
        return true;
      }
    }

    // Try to verify via the proxy
    try {
      const response = await this.callProxy("verify_order", {
        order_id: orderNumber,
        email,
      });

      return response.success && response.verified;
    } catch (error) {
      console.error("Order verification error:", error);
      return false;
    }
  },

  /**
   * Get details for a specific order
   * @param {string} orderNumber - The order ID or number
   * @param {string} email - The email associated with the order
   * @returns {Promise<Object>} - The order details
   */
  getOrderDetails: async function (orderNumber, email) {
    // Check if we have injected customer data
    if (
      window.__VoiceroCustomerData &&
      window.__VoiceroCustomerData.recent_orders
    ) {
      const orders = window.__VoiceroCustomerData.recent_orders;

      // Find the order in the customer data
      const matchingOrder = orders.find(
        (o) =>
          o.order_number === orderNumber ||
          o.name === orderNumber ||
          o.name === `#${orderNumber}`,
      );

      if (matchingOrder) {
        return matchingOrder;
      }
    }

    // Try to get details via the proxy
    try {
      const response = await this.callProxy("order_details", {
        order_id: orderNumber,
        email,
      });

      return response.success ? response.order : null;
    } catch (error) {
      console.error("Get order details error:", error);
      return null;
    }
  },

  /**
   * Check if the user is currently logged in
   * @returns {boolean} - True if the user is logged in
   */
  checkUserLoggedIn: function () {
    // Try different ways to check if user is logged in

    // Method 1: VoiceroUserData
    if (window.VoiceroUserData && window.VoiceroUserData.isLoggedIn) {
      return true;
    }

    // Method 2: Customer data injection
    if (window.__VoiceroCustomerData && window.__VoiceroCustomerData.id) {
      return true;
    }

    // Method 3: Shopify customer object
    if (
      window.Shopify &&
      window.Shopify.customer &&
      window.Shopify.customer.id
    ) {
      return true;
    }

    // Method 4: Check for login-specific elements on the page
    const accountLinks = document.querySelectorAll('a[href*="/account"]');
    const logoutLinks = document.querySelectorAll('a[href*="/logout"]');

    if (accountLinks.length > 0 && logoutLinks.length > 0) {
      return true;
    }

    return false;
  },

  /**
   * Display a user interface to select items for return
   * @param {Object} orderDetails - The order details including line items
   */
  promptForReturnItems: function (orderDetails) {
    let message = "";

    if (orderDetails.line_items && orderDetails.line_items.length > 0) {
      message +=
        "Please select which items you'd like to return from order #" +
        orderDetails.order_number +
        ":\n\n";

      orderDetails.line_items.forEach((item, index) => {
        message += `${index + 1}. ${item.title} - ${item.quantity} x $${parseFloat(item.price).toFixed(2)}\n`;
      });

      message += "\nPlease reply with the item numbers you want to return.";
    } else {
      message =
        "I couldn't find any items in this order. Please contact customer support for assistance.";
    }

    this.notifyUser(message);
  },

  /**
   * Display a user interface to select items for exchange
   * @param {Object} orderDetails - The order details including line items
   */
  promptForExchangeItems: function (orderDetails) {
    let message = "";

    if (orderDetails.line_items && orderDetails.line_items.length > 0) {
      message +=
        "Please select which items you'd like to exchange from order #" +
        orderDetails.order_number +
        ":\n\n";

      orderDetails.line_items.forEach((item, index) => {
        message += `${index + 1}. ${item.title} - ${item.quantity} x $${parseFloat(item.price).toFixed(2)}\n`;
      });

      message +=
        "\nPlease reply with the item numbers and what you'd like to exchange them for (size, color, etc).";
    } else {
      message =
        "I couldn't find any items in this order. Please contact customer support for assistance.";
    }

    this.notifyUser(message);
  },

  /**
   * Make a call to the proxy with the specified action and data
   * @param {string} action - The action to perform (refund, cancel, return, exchange)
   * @param {Object} data - The data for the action
   * @returns {Promise<Object>} - The response from the proxy
   * @private
   */
  callProxy: async function (action, data) {
    // Add the action to the data
    const payload = {
      action,
      ...data,
    };

    // Add shop domain and timestamp
    if (window.Shopify && window.Shopify.shop) {
      payload.shop = window.Shopify.shop;
    }
    payload.timestamp = new Date().toISOString();

    // Construct the URL for the proxy
    const url = this._buildUrl();

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.config.defaultHeaders,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Proxy request failed: ${response.status} ${errorText}`,
        );
      }

      const responseData = await response.json();
      return responseData;
    } catch (error) {
      console.error(`Error calling proxy for ${action}:`, error);
      throw error;
    }
  },

  /**
   * Show a notification to the user
   * @param {string} message - The message to display
   */
  notifyUser: function (message) {
    // Try VoiceroText first
    if (window.VoiceroText && window.VoiceroText.addMessage) {
      window.VoiceroText.addMessage(message, "ai");
      return;
    }

    // Try VoiceroVoice next
    if (window.VoiceroVoice && window.VoiceroVoice.addMessage) {
      window.VoiceroVoice.addMessage(message, "ai");
      return;
    }

    // Fallback to console and alert
    console.log("User notification:", message);
    alert(message);
  },

  /**
   * Build the URL for the proxy
   * @returns {string} - The complete URL
   * @private
   */
  _buildUrl: function () {
    // Get the current origin to use as base for relative URLs
    const base = window.location.origin;

    // Handle both absolute and relative URLs
    let fullUrl;
    if (this.config.proxyUrl.startsWith("http")) {
      // Already an absolute URL
      fullUrl = this.config.proxyUrl;
    } else {
      // Relative URL, prepend the origin
      fullUrl = `${base}${this.config.proxyUrl}`;
    }

    return fullUrl;
  },
};

// Export as global
window.VoiceroReturnHandler = VoiceroReturnHandler;

// Initialize on load
document.addEventListener("DOMContentLoaded", function () {
  if (window.VoiceroReturnHandler) {
    window.VoiceroReturnHandler.init();
  }
});

// Export module
export default VoiceroReturnHandler;

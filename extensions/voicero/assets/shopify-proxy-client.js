/**
 * Shopify Proxy Client
 * A JavaScript client for interacting with the Shopify app proxy.
 */

console.log("🔥 SHOPIFY PROXY CLIENT LOADED 🔥");

const ShopifyProxyClient = {
  config: {
    proxyUrl: "/apps/proxy",
    defaultHeaders: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    debug: true,
  },

  /**
   * Initialize the client with custom configuration
   * @param {Object} userConfig - Custom configuration to override defaults
   * @returns {Object} - The client instance for chaining
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
      console.log("ShopifyProxyClient initialized with config:", this.config);
    }

    return this;
  },

  /**
   * Make a GET request to the proxy
   * @param {Object} params - URL parameters to include in the request
   * @param {Object} options - Additional fetch options
   * @returns {Promise} - The fetch promise
   */
  get: function (params = {}, options = {}) {
    const url = this._buildUrl(params);

    return this._fetch(url, {
      method: "GET",
      ...options,
    });
  },

  /**
   * Make a POST request to the proxy
   * @param {Object} data - The data to send in the request body
   * @param {Object} params - URL parameters to include in the request
   * @param {Object} options - Additional fetch options
   * @returns {Promise} - The fetch promise
   */
  post: function (data = {}, params = {}, options = {}) {
    const url = this._buildUrl(params);

    return this._fetch(url, {
      method: "POST",
      body: JSON.stringify(data),
      ...options,
    });
  },

  /**
   * Fetch orders from the proxy and log them to the console
   * This is a convenience method for quickly seeing order data
   * @returns {Promise} - A promise that resolves with the orders data
   */
  fetchAndLogOrders: function () {
    console.log("Fetching orders from proxy...");

    return this.get()
      .then((response) => {
        if (response.success && response.orders) {
          console.log("Orders received from proxy:", response.orders);

          // Log each order individually for better visibility
          if (response.orders.edges && response.orders.edges.length > 0) {
            console.log(`Found ${response.orders.edges.length} orders:`);
            response.orders.edges.forEach((edge, index) => {
              console.log(`Order ${index + 1}:`, edge.node);
            });
          } else {
            console.log("No orders found or unexpected format");
          }

          return response.orders;
        } else {
          console.error(
            "Error in orders response:",
            response.error || "Unknown error",
          );
          throw new Error(response.error || "Failed to fetch orders");
        }
      })
      .catch((error) => {
        console.error("Failed to fetch orders:", error);
        throw error;
      });
  },

  /**
   * Build the URL with query parameters
   * @param {Object} params - The parameters to include in the URL
   * @returns {string} - The complete URL with query parameters
   * @private
   */
  _buildUrl: function (params = {}) {
    // Get the current origin to use as base for relative URLs
    const base = window.location.origin;
    console.log(`Using base URL: ${base}`);

    // Handle both absolute and relative URLs
    let fullUrl;
    if (this.config.proxyUrl.startsWith("http")) {
      // Already an absolute URL
      fullUrl = this.config.proxyUrl;
    } else {
      // Relative URL, prepend the origin
      fullUrl = `${base}${this.config.proxyUrl}`;
    }

    console.log(`Constructed full URL: ${fullUrl}`);
    const url = new URL(fullUrl);

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    return url.toString();
  },

  /**
   * Make a fetch request with error handling
   * @param {string} url - The URL to fetch
   * @param {Object} options - Fetch options
   * @returns {Promise} - A promise that resolves with the parsed response
   * @private
   */
  _fetch: function (url, options = {}) {
    const fetchOptions = {
      ...options,
      headers: {
        ...this.config.defaultHeaders,
        ...(options.headers || {}),
      },
    };

    console.log(`🚀 Attempting to fetch from: ${url}`);
    console.log(`With options:`, fetchOptions);

    return fetch(url, fetchOptions)
      .then((response) => {
        console.log(
          `📡 Response status: ${response.status} ${response.statusText}`,
        );

        if (!response.ok) {
          console.error(
            `⚠️ HTTP Error: ${response.status} ${response.statusText}`,
          );
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const contentType = response.headers.get("content-type");
        console.log(`Content-Type: ${contentType}`);

        if (contentType && contentType.includes("application/json")) {
          return response.json();
        } else {
          return response.text();
        }
      })
      .then((data) => {
        console.log("✅ Received data:", data);
        return data;
      })
      .catch((error) => {
        console.error("❌ Fetch error:", error);
        // Try to provide more helpful error info
        if (
          error.name === "TypeError" &&
          error.message.includes("Failed to fetch")
        ) {
          console.error(
            "This is likely a network issue, CORS problem, or the server is unavailable",
          );
        }
        throw error;
      });
  },
};

// Make globally available
window.ShopifyProxyClient = window.ShopifyProxyClient || ShopifyProxyClient;

console.log("📢 Setting up ShopifyProxyClient...");

// Initialize with debug mode on to log all requests and responses
ShopifyProxyClient.init({ debug: true });

// Try to fetch immediately
console.log("🔄 Attempting immediate fetch...");
ShopifyProxyClient.fetchAndLogOrders()
  .then((orders) => {
    console.log("✅ Immediate fetch successful!");
  })
  .catch((error) => {
    console.error("❌ Error in immediate fetch:", error);
  });

// Also try with DOMContentLoaded for safety
document.addEventListener("DOMContentLoaded", function () {
  console.log("🔄 DOM loaded, trying fetch again...");
  ShopifyProxyClient.fetchAndLogOrders()
    .then((orders) => {
      console.log("✅ DOMContentLoaded fetch successful!");
    })
    .catch((error) => {
      console.error("❌ Error in DOMContentLoaded fetch:", error);
    });
});

// Try with window.onload as a backup
window.onload = function () {
  console.log("🔄 Window loaded, trying final fetch...");
  ShopifyProxyClient.fetchAndLogOrders()
    .then((orders) => {
      console.log("✅ Window.onload fetch successful!");
    })
    .catch((error) => {
      console.error("❌ Error in window.onload fetch:", error);
    });
};

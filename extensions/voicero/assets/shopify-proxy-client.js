/**
 * Shopify Proxy Client
 * A JavaScript client for interacting with the Shopify app proxy.
 */

const ShopifyProxyClient = {
  config: {
    proxyUrl: "https://is117a-nj.myshopify.com/apps/proxy",
    defaultHeaders: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    debug: false,
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
    const url = new URL(this.config.proxyUrl);

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

    if (this.config.debug) {
      console.log(`Making ${options.method} request to:`, url);
      console.log("With options:", fetchOptions);
    }

    return fetch(url, fetchOptions)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          return response.json();
        } else {
          return response.text();
        }
      })
      .then((data) => {
        if (this.config.debug) {
          console.log("Received response:", data);
        }
        return data;
      })
      .catch((error) => {
        console.error("Error making proxy request:", error);
        throw error;
      });
  },
};

// Make globally available
window.ShopifyProxyClient = window.ShopifyProxyClient || ShopifyProxyClient;

// Initialize with debug mode on to log all requests and responses
ShopifyProxyClient.init({ debug: true });

// Auto-fetch orders when the script loads
document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM loaded, fetching orders...");
  ShopifyProxyClient.fetchAndLogOrders()
    .then((orders) => {
      console.log("Orders fetched successfully!");
    })
    .catch((error) => {
      console.error("Error auto-fetching orders:", error);
    });
});

// Example usage:
/*
// Manual fetch example
ShopifyProxyClient.fetchAndLogOrders()
  .then(orders => {
    // Do something with the orders if needed
    console.log("Total orders:", orders.edges.length);
  })
  .catch(error => console.error('Error:', error));

// Get request example
ShopifyProxyClient.get({ path: '/some/endpoint', shop: 'my-shop' })
  .then(data => console.log('Response:', data))
  .catch(error => console.error('Error:', error));

// Post request example
ShopifyProxyClient.post(
  { some: 'data', to: 'send' },
  { path: '/some/endpoint', shop: 'my-shop' }
)
  .then(data => console.log('Response:', data))
  .catch(error => console.error('Error:', error));
*/
// Note: No export statement is needed here since we're attaching directly to window

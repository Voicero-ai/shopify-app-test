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

// Example usage:
/*
ShopifyProxyClient.init({
  debug: true
});

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

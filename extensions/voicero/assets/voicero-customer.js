/**
 * VoiceroAI User Data Module
 * Loads early to fetch Shopify customer data before other scripts run
 * Stores user data in global variables for later use by other modules
 */

(function () {
  // Create global namespace for user data
  window.VoiceroUserData = {
    initialized: false,
    isLoading: true,
    isLoggedIn: false,
    customer: null,
    cart: null,
    errors: [],

    /**
     * Initialize and fetch user data
     */
    init: function () {
      console.log("VoiceroUserData: Initializing user data collection");

      // Start loading data
      this.isLoading = true;

      // Set up promise for tracking completion
      this.initPromise = new Promise((resolve) => {
        // First try to get customer data
        this.fetchCustomerData()
          .then(() => {
            // Then try to get cart data
            return this.fetchCartData();
          })
          .catch((error) => {
            console.error("VoiceroUserData: Error fetching data", error);
            this.errors.push({
              time: new Date().toISOString(),
              message: error.message || "Unknown error fetching user data",
            });
          })
          .finally(() => {
            // Mark initialization as complete
            this.isLoading = false;
            this.initialized = true;
            console.log("VoiceroUserData: Initialization complete", {
              isLoggedIn: this.isLoggedIn,
              hasCustomerData: !!this.customer,
              hasCartData: !!this.cart,
              errors: this.errors.length,
            });

            // Log full customer data object for debugging
            if (this.customer) {
              console.log("VoiceroUserData: FULL CUSTOMER DATA", this.customer);
            }

            // Store data in localStorage for debugging if needed
            try {
              localStorage.setItem(
                "voiceroUserData",
                JSON.stringify({
                  timestamp: new Date().toISOString(),
                  isLoggedIn: this.isLoggedIn,
                  customer: this.customer,
                  cart: this.cart,
                }),
              );
            } catch (e) {
              console.warn(
                "VoiceroUserData: Unable to store user data in localStorage",
                e,
              );
            }

            // Resolve the promise to signal completion
            resolve();
          });
      });

      return this.initPromise;
    },

    /**
     * Get a session token via various methods
     * @returns {Promise<string|null>} Promise that resolves with the session token or null
     */
    getSessionToken: async function () {
      console.log("VoiceroUserData: Attempting to get session token");

      // 1. Try using our App Bridge implementation if it exists
      if (
        window.shopifyAppBridge &&
        typeof window.shopifyAppBridge.getSessionToken === "function"
      ) {
        try {
          console.log(
            "VoiceroUserData: Using shopifyAppBridge.getSessionToken method",
          );
          return await window.shopifyAppBridge.getSessionToken();
        } catch (e) {
          console.warn("VoiceroUserData: Error with shopifyAppBridge token", e);
        }
      }

      // 2. Check if our override method has been set (by external code)
      if (typeof this.getSessionTokenOverride === "function") {
        try {
          console.log(
            "VoiceroUserData: Using overridden getSessionToken method",
          );
          return await this.getSessionTokenOverride();
        } catch (e) {
          console.warn(
            "VoiceroUserData: Error using overridden getSessionToken",
            e,
          );
        }
      }

      // 3. Try Shopify checkout token
      if (
        window.Shopify &&
        window.Shopify.checkout &&
        window.Shopify.checkout.token
      ) {
        console.log("VoiceroUserData: Using Shopify checkout token");
        return window.Shopify.checkout.token;
      }

      // 4. Try to get customer token from meta tag
      const metaCustomerToken = document.querySelector(
        'meta[name="shopify-customer-token"]',
      );
      if (metaCustomerToken && metaCustomerToken.content) {
        console.log("VoiceroUserData: Using meta customer token");
        return metaCustomerToken.content;
      }

      // 5. Try customer access token
      if (
        window.Shopify &&
        window.Shopify.customer &&
        window.Shopify.customer.access_token
      ) {
        console.log("VoiceroUserData: Using Shopify customer access token");
        return window.Shopify.customer.access_token;
      }

      // 6. Try customer session from cookie
      try {
        const cookies = document.cookie.split(";");
        for (let i = 0; i < cookies.length; i++) {
          const cookie = cookies[i].trim();
          if (cookie.startsWith("_shopify_customer_session=")) {
            console.log("VoiceroUserData: Using customer session cookie");
            return cookie.substring("_shopify_customer_session=".length);
          }
        }
      } catch (e) {
        console.warn("VoiceroUserData: Error checking cookies for token", e);
      }

      // 7. Fall back to standard App Bridge if available
      if (
        window.shopify &&
        window.shopify.auth &&
        window.shopify.auth.getSessionToken
      ) {
        try {
          console.log("VoiceroUserData: Using standard App Bridge token");
          return await window.shopify.auth.getSessionToken();
        } catch (e) {
          console.warn("VoiceroUserData: Unable to get session token", e);
        }
      }

      console.log("VoiceroUserData: No token method available, returning null");
      return null;
    },

    /**
     * Fetch customer data from Shopify customer object or API
     * @returns {Promise} Promise that resolves when customer data is fetched
     */
    fetchCustomerData: function () {
      return new Promise(async (resolve) => {
        // 0. First check for detailed customer data injected by Liquid (most complete)
        if (window.__VoiceroCustomerData) {
          console.log(
            "VoiceroUserData: Found DETAILED customer data from Liquid injection",
          );

          // Show basic customer profile details
          console.log("VoiceroUserData: CUSTOMER PROFILE:", {
            name:
              window.__VoiceroCustomerData.first_name +
              " " +
              window.__VoiceroCustomerData.last_name,
            email: window.__VoiceroCustomerData.email,
            orders_count: window.__VoiceroCustomerData.orders_count,
            total_spent: window.__VoiceroCustomerData.total_spent,
            created_at: window.__VoiceroCustomerData.created_at,
          });

          // Show address information if available
          if (window.__VoiceroCustomerData.default_address) {
            console.log("VoiceroUserData: MAIN ADDRESS:", {
              name:
                window.__VoiceroCustomerData.default_address.first_name +
                " " +
                window.__VoiceroCustomerData.default_address.last_name,
              address: window.__VoiceroCustomerData.default_address.address1,
              city: window.__VoiceroCustomerData.default_address.city,
              province: window.__VoiceroCustomerData.default_address.province,
              country: window.__VoiceroCustomerData.default_address.country,
              zip: window.__VoiceroCustomerData.default_address.zip,
            });
          } else {
            console.log("VoiceroUserData: No default address found");
          }

          // Show recent orders if available
          if (
            window.__VoiceroCustomerData.recent_orders &&
            window.__VoiceroCustomerData.recent_orders.length > 0
          ) {
            console.log(
              "VoiceroUserData: RECENT ORDERS:",
              window.__VoiceroCustomerData.recent_orders.map((order) => ({
                number: order.order_number,
                date: order.created_at,
                status: order.fulfillment_status,
                total: order.total_price,
                tracking: order.has_tracking
                  ? `${order.tracking_company} #${order.tracking_number}`
                  : "None",
              })),
            );
          } else {
            console.log("VoiceroUserData: No recent orders found");
          }

          this.isLoggedIn = true;
          this.customer = window.__VoiceroCustomerData;

          // Add timestamp and logged_in flag
          this.customer.logged_in = true;
          this.customer.timestamp = new Date().toISOString();

          resolve();
          return;
        } else {
          console.log(
            "VoiceroUserData: NO detailed customer data found in window.__VoiceroCustomerData",
          );
          // Log what we actually have
          console.log("VoiceroUserData: Available global vars:", {
            hasCustomerId: !!window.__VoiceroCustomerId,
            hasCustomerData: !!window.__VoiceroCustomerData,
            hasShopify: !!window.Shopify,
            hasShopifyCustomer: !!(window.Shopify && window.Shopify.customer),
          });
        }

        // 1. Check for customer ID injected by Liquid (most reliable method)
        const injectedId = window.__VoiceroCustomerId;
        if (injectedId) {
          console.log(
            "VoiceroUserData: Found customer ID from Liquid injection:",
            injectedId,
          );
          this.isLoggedIn = true;
          this.customer = {
            id: injectedId,
            // Adding additional basic info since we know customer is logged in
            logged_in: true,
            timestamp: new Date().toISOString(),
          };

          // We can stop here, but if we want more data, we can try to fetch it via API
          try {
            const moreData = await this.fetchCustomerDetails();
            if (moreData) {
              this.customer = { ...this.customer, ...moreData };
              console.log(
                "VoiceroUserData: Enhanced customer data with API details",
              );
            }
          } catch (error) {
            console.warn(
              "VoiceroUserData: Error fetching additional customer details",
              error,
            );
          }

          resolve();
          return;
        }

        // 2. Try to get customer data from the window Shopify object
        if (window.Shopify && window.Shopify.customer) {
          this.customer = window.Shopify.customer;
          this.isLoggedIn = true;
          console.log(
            "VoiceroUserData: Found customer data in Shopify object",
            this.customer,
          );
          resolve();
          return;
        }

        // 3. Try to use Customer Account API (requires proper session token)
        const moreData = await this.fetchCustomerDetails().catch((error) => {
          console.log(
            "VoiceroUserData: Could not fetch customer details from API",
            error,
          );
          return null;
        });

        if (moreData) {
          this.customer = moreData;
          this.isLoggedIn = true;
          console.log(
            "VoiceroUserData: Successfully fetched customer data from API",
          );
          resolve();
          return;
        }

        // 4. Last resort - check DOM for customer-specific elements
        const accountLinks = document.querySelectorAll('a[href*="/account"]');
        const customerAccountLink = Array.from(accountLinks).find(
          (link) =>
            !link.href.includes("login") && !link.href.includes("register"),
        );

        if (customerAccountLink) {
          console.log(
            "VoiceroUserData: Found account link that suggests user is logged in",
          );
          this.isLoggedIn = true;
          this.customer = { logged_in: true };
          resolve();
          return;
        }

        // No customer data found, user is not logged in
        console.log("VoiceroUserData: No indicators of logged-in state found");
        this.isLoggedIn = false;
        resolve();
      });
    },

    /**
     * Fetch detailed customer information using the Customer Account API
     * @returns {Promise<Object|null>} Promise that resolves with customer data or null
     */
    fetchCustomerDetails: async function () {
      try {
        console.log(
          "VoiceroUserData: Attempting to fetch detailed customer data from API",
        );
        const token = await this.getSessionToken();

        if (!token) {
          console.log(
            "VoiceroUserData: No session token available for Customer Account API",
          );
          return null;
        }

        const shopDomain = window.location.hostname;
        const response = await fetch(
          `https://${shopDomain}/account/api/2025-04/graphql.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              query: `
                query getMyAccount {
                  customer { 
                    id 
                    firstName 
                    lastName 
                    email 
                    phone 
                    acceptsMarketing 
                    tags
                    defaultAddress { 
                      id 
                      address1 
                      city 
                      province 
                      zip 
                      country 
                    }
                    addresses(first:10) { 
                      edges { 
                        node { 
                          id 
                          address1 
                          city 
                          province
                          zip
                          country
                        } 
                      } 
                    }
                    orders(first:5) { 
                      edges { 
                        node { 
                          id 
                          orderNumber 
                          totalPriceV2 { 
                            amount 
                            currencyCode 
                          } 
                        } 
                      } 
                    }
                  }
                }
              `,
            }),
          },
        );

        if (!response.ok) {
          console.warn(
            "VoiceroUserData: Customer Account API request failed",
            response.status,
          );
          return null;
        }

        const { data } = await response.json();
        if (data && data.customer) {
          console.log(
            "VoiceroUserData: Successfully fetched detailed customer data",
          );
          return data.customer;
        }

        return null;
      } catch (error) {
        console.warn("VoiceroUserData: Error fetching customer details", error);
        return null;
      }
    },

    /**
     * Fetch cart data from Shopify cart object or API
     * @returns {Promise} Promise that resolves when cart data is fetched
     */
    fetchCartData: function () {
      return new Promise((resolve) => {
        // Try to get cart data from the window Shopify object
        if (window.Shopify && window.Shopify.cart) {
          this.cart = window.Shopify.cart;
          console.log("VoiceroUserData: Found cart data in Shopify object");
          resolve();
          return;
        }

        // If not found in window object, try to fetch from /cart endpoint
        fetch("/cart.js", {
          method: "GET",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
        })
          .then((response) => {
            if (!response.ok) {
              console.warn(
                "VoiceroUserData: Error fetching cart data",
                response.status,
              );
              this.errors.push({
                time: new Date().toISOString(),
                message: `HTTP error ${response.status} fetching cart data`,
              });
              resolve(); // Resolve anyway to continue initialization
              return;
            }

            return response.json();
          })
          .then((data) => {
            if (data) {
              this.cart = data;
              console.log("VoiceroUserData: Fetched cart data successfully");
            }
            resolve();
          })
          .catch((error) => {
            console.error("VoiceroUserData: Error fetching cart data", error);
            this.errors.push({
              time: new Date().toISOString(),
              message: error.message || "Unknown error fetching cart data",
            });
            resolve(); // Resolve anyway to continue initialization
          });
      });
    },

    /**
     * Get all collected user data
     * @returns {Object} All collected user data
     */
    getUserData: function () {
      return {
        isLoggedIn: this.isLoggedIn,
        customer: this.customer,
        cart: this.cart,
      };
    },

    /**
     * Check if user data collection is complete
     * @returns {Boolean} True if initialization is complete
     */
    isInitialized: function () {
      return this.initialized;
    },
  };

  // Initialize immediately
  window.VoiceroUserData.init();
})();

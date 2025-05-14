const VoiceroActionHandler = {
  config: {
    apiBase: "/api",
    endpoints: {
      logout: "/auth/logout",
      subscription: "/subscriptions",
      trackOrder: "/orders/track",
      processReturn: "/orders/return",
      newsletter: "/newsletter/subscribe",
      accountReset: "/account/reset",
      scheduler: "/scheduler",
    },
    defaultHeaders: {
      "Content-Type": "application/json",
    },
    userCredentials: null,
    shopify: null,
  },

  init: function (userConfig = {}) {
    this.config = {
      ...this.config,
      ...userConfig,
      endpoints: {
        ...this.config.endpoints,
        ...(userConfig.endpoints || {}),
      },
      defaultHeaders: {
        ...this.config.defaultHeaders,
        ...(userConfig.defaultHeaders || {}),
      },
    };

    // Connect to Shopify config if available
    if (window.voiceroConfig) {
      this.config.shopify = window.voiceroConfig;

      // Add authorization headers if available through secure method
      if (window.voiceroConfig.getAuthHeaders) {
        this.config.defaultHeaders = {
          ...this.config.defaultHeaders,
          ...window.voiceroConfig.getAuthHeaders(),
        };
      }
    }

    this.loadCredentials();
    return this;
  },

  saveCredentials: function (credentials) {
    try {
      this.config.userCredentials = credentials;
      localStorage.setItem(
        "voiceroUserCredentials",
        JSON.stringify(credentials),
      );
    } catch (e) {
      // console.warn("Could not save credentials to localStorage:", e);
    }
  },

  loadCredentials: function () {
    try {
      const saved = localStorage.getItem("voiceroUserCredentials");
      if (saved) {
        this.config.userCredentials = JSON.parse(saved);
      }
    } catch (e) {
      // console.warn("Could not load credentials from localStorage:", e);
    }
  },

  clearCredentials: function () {
    try {
      localStorage.removeItem("voiceroUserCredentials");
      this.config.userCredentials = null;
    } catch (e) {
      // console.warn("Could not clear credentials:", e);
    }
  },

  pendingHandler: () => {
    const action = sessionStorage.getItem("pendingAction");
    if (action === "logout") {
      const shopifyLogoutLink = document.querySelector(
        'a[href*="/account/logout"], form[action*="/account/logout"]',
      );

      if (shopifyLogoutLink) {
        if (shopifyLogoutLink.tagName === "FORM") {
          shopifyLogoutLink.submit();
        } else {
          shopifyLogoutLink.click();
        }
      }
      sessionStorage.removeItem("pendingAction");
    }
  },

  handle: function (response) {
    if (!response || typeof response !== "object") {
      // console.warn('Invalid response object');
      return;
    }

    const { answer, action, action_context } = response;
    // console.log("==>response", response)
    if (answer) {
      // console.debug("AI Response:", { answer, action, action_context });
    }

    if (!action) {
      // console.warn("No action specified");
      return;
    }

    let targets = [];
    if (Array.isArray(action_context)) {
      targets = action_context;
    } else if (action_context && typeof action_context === "object") {
      targets = [action_context];
    }

    try {
      // Create a mapping for actions that might use different formats
      const actionMapping = {
        get_orders: "handleGet_orders",
      };

      // Get the handler name - either from the mapping or generate from the action name
      const handlerName =
        actionMapping[action] || `handle${this.capitalizeFirstLetter(action)}`;

      if (typeof this[handlerName] !== "function") {
        // console.warn(`No handler for action: ${action}`);
        return;
      }

      if (targets.length > 0) {
        // If we have targets, call handler for each one
        targets.forEach((target) => {
          if (target && typeof target === "object") {
            // console.log("==>target", target);
            this[handlerName](target);
          }
        });
      } else {
        // If no targets, just call the handler with no arguments
        // console.log(`Calling ${handlerName} with no context`);
        this[handlerName]();
      }
    } catch (error) {
      // console.error(`Error handling action ${action}:`, error);
    }
  },

  capitalizeFirstLetter: function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  },

  escapeRegExp: function (string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  },

  getApiUrl: function (endpointKey) {
    if (!this.config.endpoints[endpointKey]) {
      // console.warn(`No endpoint configured for ${endpointKey}`);
      return null;
    }
    return `${this.config.apiBase}${this.config.endpoints[endpointKey]}`;
  },

  findElement: function ({
    selector,
    exact_text,
    button_text,
    role,
    tagName,
    placeholder,
  }) {
    if (selector) {
      const element = document.querySelector(selector);
      if (element) return element;
    }

    if (button_text) {
      const interactiveElements = document.querySelectorAll(
        'button, a, input, [role="button"]',
      );

      for (let el of interactiveElements) {
        if (el.textContent.trim().toLowerCase() === button_text.toLowerCase())
          return el;
        if (
          el.tagName === "INPUT" &&
          el.value.trim().toLowerCase() === button_text.toLowerCase()
        )
          return el;
        if (
          el.getAttribute("aria-label")?.toLowerCase() ===
          button_text.toLowerCase()
        )
          return el;
      }
    }

    if (placeholder) {
      const inputs = document.querySelectorAll("input, textarea");
      for (let el of inputs) {
        if (el.placeholder?.toLowerCase().includes(placeholder.toLowerCase()))
          return el;
      }
    }

    if (exact_text) {
      const elements = document.querySelectorAll(tagName || "*");
      for (let el of elements) {
        if (el.textContent.trim() === exact_text) return el;
      }
    }

    if (role) {
      const elements = document.querySelectorAll(`[role="${role}"]`);
      for (let el of elements) {
        if (!exact_text || el.textContent.trim() === exact_text) return el;
      }
    }

    return null;
  },

  findForm: function (formType) {
    const formSelectors = {
      login:
        'form#customer_login, form.customer-login-form, form[action*="account/login"]',
      tracking: 'form.order-lookup, form[action*="orders/lookup"]',
      return: 'form.return-form, form[action*="orders/return"]',
      newsletter:
        'form.newsletter-form, form[action*="contact#newsletter"], form[action*="newsletter"]',
      checkout: 'form#checkout, form.cart-form, form[action*="checkout"]',
      account:
        'form#recover-form, form.recover-form, form[action*="account/recover"]',
      default: "form",
    };

    return document.querySelector(
      formSelectors[formType] || formSelectors.default,
    );
  },

  handleScroll: function (target) {
    const { exact_text, css_selector, offset = 0 } = target || {};

    if (exact_text) {
      const element = this.findElement({ exact_text });
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      // console.warn(`Text not found: "${exact_text}"`, element);
      return;
    }

    if (css_selector) {
      const element = document.querySelector(css_selector);
      if (element) {
        const elementPosition =
          element.getBoundingClientRect().top + window.pageYOffset;
        window.scrollTo({
          top: elementPosition - offset,
          behavior: "smooth",
        });
        return;
      }
      // console.warn(`Element not found with selector: ${css_selector}`);
      return;
    }

    // console.warn("No selector or text provided for scroll", target);
  },

  handleClick: function (target) {
    const element = this.findElement({
      ...target,
      button_text: target.button_text || target.exact_text,
      tagName: 'button, a, input, [role="button"]',
    });

    if (element) {
      try {
        const clickEvent = new MouseEvent("click", {
          view: window,
          bubbles: true,
          cancelable: true,
        });
        element.dispatchEvent(clickEvent);
        return true;
      } catch (error) {
        // console.error("Error clicking element:", error);
      }
    }

    // console.warn("Click target not found:", target);
    return false;
  },

  handleFill_form: function (target) {
    const { form_id, form_type, input_fields } = target || {};

    if (!input_fields || !Array.isArray(input_fields)) {
      // console.warn("No form fields provided");
      return;
    }

    let form = form_id
      ? document.getElementById(form_id)
      : form_type
        ? this.findForm(form_type)
        : null;

    if (!form && input_fields.length > 0) {
      const firstField = input_fields[0];
      const potentialInput = document.querySelector(
        `[name="${firstField.name}"], [placeholder*="${firstField.placeholder}"], [id="${firstField.id}"]`,
      );
      if (potentialInput) form = potentialInput.closest("form");
    }

    input_fields.forEach((field) => {
      const { name, value, placeholder, id } = field;
      if (!name && !placeholder && !id) {
        // console.warn("Invalid field configuration - no identifier:", field);
        return;
      }

      const selector = [
        name && `[name="${name}"]`,
        placeholder && `[placeholder*="${placeholder}"]`,
        id && `#${id}`,
      ]
        .filter(Boolean)
        .join(", ");

      const element = form
        ? form.querySelector(selector)
        : document.querySelector(selector);

      if (!element) {
        // console.warn(`Form element not found:`, field);
        return;
      }

      if (element.tagName === "SELECT") {
        element.value = value;
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (
        element.tagName === "INPUT" ||
        element.tagName === "TEXTAREA"
      ) {
        if (element.type === "checkbox" || element.type === "radio") {
          element.checked = Boolean(value);
        } else {
          element.value = value;
        }
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    if (form && target.auto_submit !== false) {
      setTimeout(() => {
        form.dispatchEvent(new Event("submit", { bubbles: true }));
      }, 100);
    }
  },

  handleHighlight_text: function (target) {
    const {
      selector,
      exact_text,
      color = "#f9f900",
      scroll = true,
      offset = 50,
    } = target || {};

    // 1. Remove all previous highlights first
    document.querySelectorAll('[style*="background-color"]').forEach((el) => {
      if (
        el.style.backgroundColor === color ||
        el.style.backgroundColor === "rgb(249, 249, 0)"
      ) {
        el.style.backgroundColor = "";
        // Remove span wrappers we added
        if (
          el.tagName === "SPAN" &&
          el.hasAttribute("style") &&
          el.parentNode
        ) {
          el.replaceWith(el.textContent);
        }
      }
    });

    let firstHighlightedElement = null;

    // 2. Handle selector-based highlighting
    if (selector) {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        el.style.backgroundColor = color;
        if (!firstHighlightedElement) firstHighlightedElement = el;
      });
    }
    // 3. Handle exact text highlighting (case-insensitive)
    else if (exact_text) {
      const regex = new RegExp(this.escapeRegExp(exact_text), "gi");
      // Select all elements that might contain text nodes
      const elements = document.querySelectorAll(
        "p, span, div, li, td, h1, h2, h3, h4, h5, h6",
      );

      // Function to process text nodes
      const highlightTextNodes = (node) => {
        if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()) {
          const text = node.nodeValue;
          let match;
          let lastIndex = 0;
          const fragment = document.createDocumentFragment();

          while ((match = regex.exec(text)) !== null) {
            // Add text before the match
            if (match.index > lastIndex) {
              fragment.appendChild(
                document.createTextNode(text.substring(lastIndex, match.index)),
              );
            }

            // Add highlighted match
            const span = document.createElement("span");
            span.style.backgroundColor = color;
            span.appendChild(document.createTextNode(match[0]));
            fragment.appendChild(span);

            lastIndex = regex.lastIndex;

            // Track first highlighted element for scrolling
            if (!firstHighlightedElement) {
              firstHighlightedElement = span;
            }
          }

          // Add remaining text after last match
          if (lastIndex < text.length) {
            fragment.appendChild(
              document.createTextNode(text.substring(lastIndex)),
            );
          }

          // Replace the original text node with our fragment
          if (fragment.childNodes.length > 0) {
            node.parentNode.replaceChild(fragment, node);
          }
        } else if (
          node.nodeType === Node.ELEMENT_NODE &&
          node.offsetParent !== null &&
          getComputedStyle(node).display !== "none" &&
          !["SCRIPT", "STYLE", "TITLE", "A", "LINK"].includes(node.tagName)
        ) {
          // Process child nodes recursively
          Array.from(node.childNodes).forEach(highlightTextNodes);
        }
      };

      // Process each element
      elements.forEach((el) => {
        if (
          el.offsetParent === null ||
          getComputedStyle(el).display === "none"
        ) {
          return;
        }
        highlightTextNodes(el);
      });
    } else {
      // console.warn("No selector or text provided for highlight");
      return;
    }

    // 4. Scroll to first highlighted element if requested
    if (scroll && firstHighlightedElement) {
      const elementPosition =
        firstHighlightedElement.getBoundingClientRect().top +
        window.pageYOffset;
      window.scrollTo({
        top: elementPosition - offset,
        behavior: "smooth",
      });
    }
  },

  handleLogin: async function (target) {
    // Extract username and password from the new target structure
    const inputFields = (target?.input_fields || []).reduce((acc, field) => {
      acc[field.name] = field.value;
      return acc;
    }, {});

    const { username, password } = inputFields;
    const remember = true;
    if (!username || !password) {
      // console.warn("Username and password required for login");
      return;
    }

    // Try Shopify customer login form
    const loginForm = document.querySelector(
      'form#customer_login, form.customer-login-form, form[action*="account/login"]',
    );
    if (loginForm) {
      const usernameField = loginForm.querySelector(
        'input[name="customer[email]"], input[type="email"][name*="email"]',
      );
      const passwordField = loginForm.querySelector(
        'input[name="customer[password]"], input[type="password"]',
      );
      const rememberField = loginForm.querySelector(
        'input[name="customer[remember]"]',
      );

      if (usernameField && passwordField) {
        usernameField.value = username;
        passwordField.value = password;
        if (rememberField) rememberField.checked = remember;

        // Trigger change events
        usernameField.dispatchEvent(new Event("input", { bubbles: true }));
        passwordField.dispatchEvent(new Event("input", { bubbles: true }));

        // Submit the form
        loginForm.submit();
        return;
      }
    }

    // Fallback to Shopify customer login endpoint
    try {
      // Standard Shopify customer login endpoint
      const apiUrl = "/account/login";
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `form_type=customer_login&customer[email]=${encodeURIComponent(
          username,
        )}&customer[password]=${encodeURIComponent(password)}`,
      });

      if (response.ok) {
        window.location.reload();
        return;
      }

      // console.warn("Login failed:", response.statusText);
    } catch (error) {
      // console.error("Login error:", error);
    }
  },

  handleLogout: function () {
    this.clearCredentials();

    const logoutLink = document.querySelector(
      'a[href*="/account/logout"], form[action*="/account/logout"]',
    );
    if (logoutLink) {
      if (logoutLink.tagName === "FORM") {
        logoutLink.submit();
      } else {
        logoutLink.click();
      }
      return;
    }

    // Store the pending action in sessionStorage
    sessionStorage.setItem("pendingAction", "logout");
    window.location.href = "/account/logout";
  },

  handleNewsletter_signup: async function (target) {
    let email, firstname, lastname, phone;
    let formId;
    let autoSubmit = true;

    if (target && target.form_id && target.input_fields) {
      formId = target.form_id;
      target.input_fields.forEach((field) => {
        if (field.name === "email") email = field.value;
        if (field.name === "firstname") firstname = field.value;
        if (field.name === "lastname") lastname = field.value;
        if (field.name === "phone") phone = field.value;
      });
      if (typeof target.auto_submit !== "undefined") {
        autoSubmit = target.auto_submit;
      }
    } else {
      ({ email, firstname, lastname, phone } = target || {});
    }

    if (!email) {
      // console.warn("Email required for newsletter signup");
      return;
    }

    let newsletterForm;
    if (formId) {
      newsletterForm = document.getElementById(formId);
    }
    if (!newsletterForm) {
      newsletterForm =
        this.findForm("newsletter") ||
        document.querySelector('form[action*="/contact#newsletter"]');
    }

    if (newsletterForm) {
      const emailField = newsletterForm.querySelector(
        'input[type="email"], input[name="contact[email]"], [aria-label*="email"], [placeholder*="email"]',
      );
      const firstNameField = newsletterForm.querySelector(
        'input[name="contact[first_name]"], [aria-label*="first name"], [placeholder*="first name"]',
      );
      const lastNameField = newsletterForm.querySelector(
        'input[name="contact[last_name]"], [aria-label*="last name"], [placeholder*="last name"]',
      );
      const phoneField = newsletterForm.querySelector(
        'input[type="tel"], input[name="contact[phone]"], [aria-label*="phone"], [placeholder*="phone"]',
      );

      // Fill fields if found
      if (emailField) {
        emailField.value = email;
        emailField.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (firstNameField && firstname) {
        firstNameField.value = firstname;
        firstNameField.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (lastNameField && lastname) {
        lastNameField.value = lastname;
        lastNameField.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (phoneField && phone) {
        phoneField.value = phone;
        phoneField.dispatchEvent(new Event("input", { bubbles: true }));
      }

      // Submit if autoSubmit is true (default)
      if (autoSubmit) {
        setTimeout(() => {
          const submitEvent = new Event("submit", {
            bubbles: true,
            cancelable: true,
          });
          newsletterForm.dispatchEvent(submitEvent);
          if (!submitEvent.defaultPrevented) {
            newsletterForm.submit();
          }
        }, 100);
      }

      return;
    }

    // API fallback
    const newsletterUrl = this.getApiUrl("newsletter");
    if (!newsletterUrl) return;

    try {
      const response = await fetch(newsletterUrl, {
        method: "POST",
        headers: this.config.defaultHeaders,
        body: JSON.stringify({ email, firstname, lastname, phone }),
      });

      const data = await response.json();
      if (window.VoiceroText?.addMessage) {
        if (data.success) {
          window.VoiceroText.addMessage(
            "Thank you for subscribing to our newsletter!",
          );
        } else {
          window.VoiceroText.addMessage(
            data.message || "Newsletter signup failed",
          );
        }
      }
    } catch (error) {
      // console.error("Newsletter signup error:", error);
      if (window.VoiceroText?.addMessage) {
        window.VoiceroText.addMessage("Failed to complete newsletter signup");
      }
    }
  },

  handleAccount_reset: async function (target) {
    const { email } = target || {};
    if (!email) {
      // console.warn("Email required for account reset");
      return;
    }

    const accountForm =
      this.findForm("account") ||
      document.querySelector('form[action*="/account/recover"]');
    if (accountForm) {
      const emailField = accountForm.querySelector(
        'input[type="email"], input[name="email"]',
      );
      if (emailField) {
        emailField.value = email;
        accountForm.dispatchEvent(new Event("submit", { bubbles: true }));
        return;
      }
    }

    // Shopify account recovery endpoint
    try {
      const response = await fetch("/account/recover", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `form_type=recover_customer_password&email=${encodeURIComponent(email)}`,
      });

      if (response.ok && window.VoiceroText?.addMessage) {
        window.VoiceroText.addMessage(
          "Password reset instructions have been sent to your email.",
        );
      }
    } catch (error) {
      // console.error("Account reset error:", error);
    }
  },

  handleStart_subscription: function (target) {
    this.handleSubscriptionAction(target, "start");
  },

  handleStop_subscription: function (target) {
    this.handleSubscriptionAction(target, "stop");
  },

  handleSubscriptionAction: async function (target, action) {
    const { subscription_id, product_id, plan_id, variant_id } = target || {};

    if (!subscription_id && !product_id && !plan_id && !variant_id) {
      // console.warn("No subscription, product or plan ID provided");
      return;
    }

    // Look for subscription-related buttons
    const buttonSelector =
      action === "start"
        ? `button[data-product-id="${product_id}"], button[data-variant-id="${variant_id}"], button.subscribe-button`
        : `button[data-subscription-id="${subscription_id}"], button.cancel-subscription`;

    const button = document.querySelector(buttonSelector);
    if (button) {
      button.click();
      return;
    }

    // Handle purchase flow for subscriptions if this is a start action
    if (action === "start" && (product_id || variant_id)) {
      // Redirect to product page with selling plan selection
      if (product_id) {
        const productUrl = `/products/${product_id}`;
        window.location.href = productUrl;
        return;
      }

      // Try to add subscription directly using variant ID
      if (variant_id) {
        try {
          // Most Shopify subscription apps use selling_plan_id for subscription options
          const selling_plan_id = plan_id;

          const formData = {
            items: [
              {
                id: variant_id,
                quantity: 1,
                selling_plan: selling_plan_id,
              },
            ],
          };

          const response = await fetch("/cart/add.js", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(formData),
          });

          if (response.ok) {
            if (window.VoiceroText?.addMessage) {
              window.VoiceroText.addMessage(
                "✅ Subscription added to cart! <a href='/cart' style='color: #00ff88;'>View Cart</a>",
              );
            }
            return;
          }

          const errorData = await response.json();
          throw new Error(
            errorData.description || "Failed to add subscription",
          );
        } catch (error) {
          // console.error("Subscription error:", error);
          if (window.VoiceroText?.addMessage) {
            window.VoiceroText.addMessage(
              `❌ Failed to add subscription: ${error.message}`,
            );
          }
        }
      }
    }

    // For cancellations, redirect to the customer account subscriptions page
    if (action === "stop" && subscription_id) {
      window.location.href = "/account/subscriptions";
      return;
    }

    // Fallback to generic subscriptions page
    window.location.href = "/account/subscriptions";
  },

  handlePurchase: async function (target) {
    const {
      product_id,
      product_name,
      button_text = "Add to cart",
      quantity = 1,
      variant_id,
    } = target || {};

    if (!product_id && !product_name && !variant_id) {
      // console.warn("No product identifier provided for purchase");
      if (window.VoiceroText?.addMessage) {
        window.VoiceroText.addMessage("Please specify a product to purchase");
      }
      return;
    }

    // 1. Find product by name if no ID provided
    if (product_name && !variant_id && !product_id) {
      const productElements = Array.from(
        document.querySelectorAll(
          'a[href*="/products/"], .product-link, .product-item__link',
        ),
      );

      const productElement = productElements.find((el) => {
        const titleEl =
          el.querySelector("h2, .product-title, .product-item__title") || el;
        return titleEl.textContent.trim().includes(product_name);
      });

      if (productElement) {
        productElement.click();
        return;
      }
    }

    // 2. Direct Add to Cart with variant ID or product ID
    try {
      let formData = {
        items: [
          {
            id: variant_id || product_id,
            quantity: quantity,
          },
        ],
      };

      const response = await fetch("/cart/add.js", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        if (window.VoiceroText?.addMessage) {
          window.VoiceroText.addMessage(
            `✅ Added ${quantity} ${product_name || "item"} to cart! ` +
              `<a href="/cart" style="color: #00ff88;">View Cart</a>`,
          );
        }

        // Refresh cart elements if available
        if (typeof window.refreshCart === "function") {
          window.refreshCart();
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.description || "Failed to add item to cart");
      }
    } catch (error) {
      // console.error("Purchase error:", error);
      if (window.VoiceroText?.addMessage) {
        window.VoiceroText.addMessage(
          `❌ Failed to add item to cart: ${error.message}`,
        );
      }
    }
  },

  handleTrack_order: async function (target) {
    const { order_id, email, order_number } = target || {};
    const orderNumberToFind = order_number || order_id;

    // Check if we have customer data available from the Liquid template
    if (
      window.__VoiceroCustomerData &&
      window.__VoiceroCustomerData.recent_orders
    ) {
      const orders = window.__VoiceroCustomerData.recent_orders;

      // Find the order with the matching order number
      const order = orders.find(
        (o) =>
          o.order_number === orderNumberToFind ||
          o.name === orderNumberToFind ||
          o.name === `#${orderNumberToFind}`,
      );

      if (order) {
        // Build a formatted message with detailed order information
        const date = new Date(order.created_at).toLocaleDateString();
        const status =
          order.fulfillment_status === "fulfilled"
            ? "✅ Fulfilled"
            : order.financial_status === "paid"
              ? "💰 Paid (Processing)"
              : "⏳ " + (order.financial_status || "Processing");

        let message = `## Order Details for #${order.order_number}\n\n`;
        message += `Order Date: ${date} - $${parseFloat(order.total_price).toFixed(2)} - ${order.line_items_count} ${order.line_items_count === 1 ? "item" : "items"}\n`;
        message += `Order Status\n\n`;

        // Add detailed tracking information if available
        if (order.has_tracking) {
          message += `Your order has been shipped! You can track it below:\n\n`;

          if (order.tracking_company) {
            message += `Carrier: ${order.tracking_company}\n`;
          }

          if (order.tracking_number) {
            message += `Tracking Number: ${order.tracking_number}\n`;
          }

          if (order.tracking_url) {
            message += `[Track Package](${order.tracking_url})\n`;
          }
        } else if (order.fulfillment_status === "fulfilled") {
          message += `Your order has been fulfilled and is on its way! Unfortunately, no tracking information is available at this time.\n`;
        } else {
          message += `Your order is still being processed. Once it ships, tracking information will be provided.\n`;
        }

        // Add a link to view complete order details
        message += `\n[View Complete Order Details](/account/orders/${order.name})`;

        // Display the message using VoiceroText
        if (window.VoiceroText?.addMessage) {
          window.VoiceroText.addMessage(message, "ai");
        }
        // Display the message using VoiceroVoice as well
        if (window.VoiceroVoice?.addMessage) {
          window.VoiceroVoice.addMessage(message, "ai");
        }
        return;
      }
    }

    // If we couldn't find the order or user isn't logged in

    // Check if email and order_id are provided for tracking lookup
    if (!orderNumberToFind || (!email && !window.__VoiceroCustomerData)) {
      
      return;
    }   
  },

  handleProcess_return: async function (target) {
    // Enhanced return processing with better field detection for Shopify
    const { order_id, email, reason, items = [] } = target || {};
    if (!order_id || !email) {
      // Try to use saved order info if available
      if (this.config.userCredentials?.lastOrder) {
        target = { ...this.config.userCredentials.lastOrder, ...target };
      } else {
        // console.warn("Order ID and email required for return");
        return;
      }
    }

    const returnForm =
      this.findForm("return") ||
      document.querySelector('form[action*="return_request"]');
    if (returnForm) {
      const orderIdField = returnForm.querySelector(
        'input[name="return[order_id]"], input[name="order_id"]',
      );
      const emailField = returnForm.querySelector(
        'input[type="email"], input[name="return[email]"], input[name="email"]',
      );
      const reasonField = returnForm.querySelector(
        'select[name="return[reason]"], textarea[name="return[reason]"], select[name="reason"], textarea[name="reason"]',
      );

      if (orderIdField && emailField) {
        orderIdField.value = order_id;
        emailField.value = email;
        if (reasonField) reasonField.value = reason;

        items.forEach((item) => {
          const itemCheckbox = returnForm.querySelector(
            `input[name="return[items][]"][value="${item.id}"], 
                         input[name="return_items[]"][value="${item.id}"]`,
          );
          if (itemCheckbox) itemCheckbox.checked = true;
        });

        returnForm.dispatchEvent(new Event("submit", { bubbles: true }));
        return;
      }
    }

    // If no form is found, redirect to the returns page
    if (window.VoiceroText?.addMessage) {
      window.VoiceroText.addMessage(
        `To start a return for order #${order_id}, please visit the returns page.`,
      );
    }

    // Redirect to returns page
    window.location.href = `/account/returns/new?order_id=${order_id}&email=${encodeURIComponent(email)}`;
  },

  handleScheduler: async function (target) {
    const { action, date, time, event } = target || {};
    if (!action) {
      // console.warn("No action specified for scheduler");
      return;
    }

    const schedulerUrl = this.getApiUrl("scheduler");
    if (!schedulerUrl) return;

    try {
      const response = await fetch(schedulerUrl, {
        method: "POST",
        headers: this.config.defaultHeaders,
        body: JSON.stringify({ action, date, time, event }),
      });

      const data = await response.json();
      if (data.success && window.VoiceroText?.addMessage) {
        window.VoiceroText.addMessage(`Scheduler: ${data.message}`);
      } else if (!data.success) {
        // console.warn("Scheduler action failed:", data.message);
      }
    } catch (error) {
      // console.error("Scheduler error:", error);
    }
  },

  handleGet_orders: function () {
    // Check if we have customer data available from the Liquid template
    if (
      window.__VoiceroCustomerData &&
      window.__VoiceroCustomerData.recent_orders
    ) {
      const orders = window.__VoiceroCustomerData.recent_orders;

      if (orders.length === 0) {
        // If no orders found
        if (window.VoiceroText?.addMessage) {
          window.VoiceroText.addMessage(
            "I don't see any orders associated with your account. If you've placed an order recently, it might not be showing up yet.",
            "ai",
          );
        }
        // Add to VoiceroVoice as well
        if (window.VoiceroVoice?.addMessage) {
          window.VoiceroVoice.addMessage(
            "I don't see any orders associated with your account. If you've placed an order recently, it might not be showing up yet.",
            "ai",
          );
        }
        return;
      }

      // Build a nicely formatted message with order information
      let message = "📦 **Here are your recent orders:**\n\n";

      orders.forEach((order, index) => {
        const date = new Date(order.created_at).toLocaleDateString();
        const status =
          order.fulfillment_status === "fulfilled"
            ? "✅ Fulfilled"
            : order.financial_status === "paid"
              ? "💰 Paid (Processing)"
              : "⏳ " + (order.financial_status || "Processing");

        message += `**Order #${order.order_number}** (${date})`;
        message += ` • Total: $${parseFloat(order.total_price).toFixed(2)}`;
        message += ` • Items: ${order.line_items_count}\n`;

        // Add tracking information if available
        if (order.has_tracking) {
          message += ` • Tracking: ${order.tracking_company || "Carrier"}`;
          if (order.tracking_url) {
            message += ` - [Track Package](${order.tracking_url})\n`;
          } else if (order.tracking_number) {
            message += ` - ${order.tracking_number}\n`;
          } else {
            message += `\n`;
          }
        }

        // Add a link to view order details
        message += ` • [View Complete Order Details](/account/orders/${order.name})\n`;

        // Add separator between orders, except for the last one
        if (index < orders.length - 1) {
          message += "\n---\n\n";
        }
      });

      // Add a note about viewing all orders
      message +=
        "\n\nYou can view your complete order history in your [account page](/account).";
      message +=
        "\n\nIs there a specific order you'd like more information about?";

      // Display the message using VoiceroText
      if (window.VoiceroText?.addMessage) {
        window.VoiceroText.addMessage(message, "ai");
      }
      // Add to VoiceroVoice as well
      if (window.VoiceroVoice?.addMessage) {
        window.VoiceroVoice.addMessage(message, "ai");
      }
    } else {
      // If customer data is not available, prompt to log in
      if (window.VoiceroText?.addMessage) {
        window.VoiceroText.addMessage(
          "To view your orders, you'll need to be logged in. I can take you to the login page, and once you're logged in, I'll be able to show you your order history.",
          "ai",
        );
      }
      // Add to VoiceroVoice as well
      if (window.VoiceroVoice?.addMessage) {
        window.VoiceroVoice.addMessage(
          "To view your orders, you'll need to be logged in. I can take you to the login page, and once you're logged in, I'll be able to show you your order history.",
          "ai",
        );
      }
    }
  },

  handleRedirect: function (target) {
    let url;
    if (typeof target === "string") {
      url = target;
    } else if (target && typeof target === "object") {
      url = target.url;
    }

    if (!url) {
      // console.warn("No URL provided for redirect");
      return;
    }

    try {
      let finalUrl = url;

      if (url.startsWith("/") && !url.startsWith("//")) {
        finalUrl = window.location.origin + url;
      }

      const urlObj = new URL(finalUrl);

      if (!["http:", "https:"].includes(urlObj.protocol)) {
        // console.warn("Unsupported URL protocol:", urlObj.protocol);
        return;
      }

      window.location.href = finalUrl;
    } catch (e) {
      // console.warn("Invalid URL:", url, e);

      if (url.startsWith("/") && !url.startsWith("//")) {
        try {
          const fallbackUrl = window.location.origin + url;
          new URL(fallbackUrl); // Validate again
          window.location.href = fallbackUrl;
          return;
        } catch (fallbackError) {
          // console.warn("Fallback URL attempt failed:", fallbackUrl, fallbackError);
        }
      }
    }
  },
};

window.addEventListener("load", VoiceroActionHandler.pendingHandler);

window.VoiceroActionHandler =
  window.VoiceroActionHandler || VoiceroActionHandler;

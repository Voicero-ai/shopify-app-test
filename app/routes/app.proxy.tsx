import { ActionFunction, LoaderFunction, json } from "@remix-run/node";
import { authenticate } from "app/shopify.server";
import { Page } from "@shopify/polaris";

export const dynamic = "force-dynamic";

// Helper function to add CORS headers
const addCorsHeaders = (responseInit: ResponseInit = {}) => {
  return {
    ...responseInit,
    headers: {
      ...(responseInit.headers || {}),
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  };
};

export const loader: LoaderFunction = async ({ request }) => {
  console.log("🚀 APP PROXY LOADER HIT 🚀");
  console.log("Request URL:", request.url);
  console.log("Request method:", request.method);

  // Handle preflight requests
  if (request.method.toLowerCase() === "options") {
    return new Response(null, addCorsHeaders({ status: 204 }));
  }

  try {
    // Authenticate the app proxy request
    // This gives us access to session, admin, and storefront APIs for the shop
    const { session, admin } = await authenticate.public.appProxy(request);
    console.log("Session available:", !!session);

    if (!session || !admin) {
      console.log("⚠️ No session or admin API client available");
      return json(
        { error: "Unauthorized or app not installed" },
        addCorsHeaders({ status: 401 }),
      );
    }

    console.log("✅ Session authenticated successfully");
    console.log("Shop domain:", session.shop);
    console.log("Admin API client available:", !!admin);

    // Get current date and date from 20 days ago
    const now = new Date();
    const twentyDaysAgo = new Date();
    twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

    // Format dates for the query in ISO format
    const minDate = twentyDaysAgo.toISOString();
    const maxDate = now.toISOString();

    console.log(`Fetching orders from ${minDate} to ${maxDate}`);

    // Initialize variables for pagination
    let hasNextPage = true;
    let cursor: string | null = null;
    let allOrderEdges: Array<{ cursor: string; node: any }> = [];
    let pageCount = 0;
    const PAGE_SIZE = 50; // Max 50 orders per page

    // Loop until we've fetched all orders
    while (hasNextPage) {
      pageCount++;
      console.log(`Fetching orders page ${pageCount}...`);

      // Build the pagination part of the query
      const paginationParams: string = cursor
        ? `first: ${PAGE_SIZE}, after: "${cursor}"`
        : `first: ${PAGE_SIZE}`;

      // Build the GraphQL query
      const query: string = `
        query {
          orders(${paginationParams}, query: "created_at:>='${minDate}' AND created_at:<='${maxDate}'") {
            edges {
              cursor
              node {
                id
                name
                createdAt
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                customer {
                  firstName
                  lastName
                  email
                }
                displayFulfillmentStatus
                lineItems(first: 5) {
                  edges {
                    node {
                      name
                      quantity
                      variant {
                        price
                        title
                      }
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      `;

      // Execute the query
      const response: any = await admin.graphql(query);
      const responseJson: any = await response.json();

      // Extract the results
      const { orders } = responseJson.data;

      // Add this page's orders to our collection
      if (orders.edges.length > 0) {
        allOrderEdges = [...allOrderEdges, ...orders.edges];
        console.log(
          `Added ${orders.edges.length} orders from page ${pageCount}`,
        );
      }

      // Update pagination variables for next iteration
      hasNextPage = orders.pageInfo.hasNextPage;

      // If there's another page, get the cursor of the last item
      if (hasNextPage && orders.edges.length > 0) {
        cursor = orders.edges[orders.edges.length - 1].cursor;
      } else {
        // No more pages
        break;
      }
    }

    console.log("📦 All orders fetched successfully");
    console.log(
      `Total orders found: ${allOrderEdges.length} across ${pageCount} pages`,
    );

    // Output a sample order to logs to verify the data
    if (allOrderEdges.length > 0) {
      console.log(
        "Sample order:",
        JSON.stringify(allOrderEdges[0].node, null, 2),
      );
    } else {
      console.log("No orders found in the date range");
    }

    // Create the final response object with the same structure
    // that the frontend expects
    const ordersResponse = {
      edges: allOrderEdges,
    };

    return json(
      {
        success: true,
        orders: ordersResponse,
        totalCount: allOrderEdges.length,
        pageCount: pageCount,
      },
      addCorsHeaders(),
    );
  } catch (error) {
    console.error("❌ Error in app proxy loader:", error);
    return json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch orders",
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      addCorsHeaders({ status: 500 }),
    );
  }
};

export const action: ActionFunction = async ({ request }) => {
  console.log("🔥 APP PROXY ACTION HIT 🔥");
  console.log("Request URL:", request.url);
  console.log("Request method:", request.method);

  // Handle preflight requests
  if (request.method.toLowerCase() === "options") {
    return new Response(null, addCorsHeaders({ status: 204 }));
  }

  try {
    // Authenticate the app proxy request
    const { session, admin } = await authenticate.public.appProxy(request);

    if (!session || !admin) {
      console.log("⚠️ No session or admin API client available in action");
      return json(
        { error: "Unauthorized or app not installed" },
        addCorsHeaders({ status: 401 }),
      );
    }

    console.log("✅ Action session authenticated successfully");
    console.log("Shop domain:", session.shop);

    // Handle POST/PUT/DELETE requests here
    const data = await request.json();
    console.log("Received data:", data);

    // Handle customer update action
    if (data.action === "updateCustomer" && data.customer) {
      console.log("Processing customer update:", data.customer);

      try {
        // Get the customer ID and address data
        const customerId = data.customer.id;
        const hasAddressUpdate = !!data.customer.defaultAddress;
        const addressData = data.customer.defaultAddress;

        // Create a copy of customer data without the ID and address for basic customer updates
        const customerInput = { ...data.customer };
        delete customerInput.id;
        delete customerInput.defaultAddress;

        // Check if we have any data to update
        if (Object.keys(customerInput).length === 0 && !hasAddressUpdate) {
          return json(
            { success: false, error: "No valid fields to update" },
            addCorsHeaders(),
          );
        }

        // Validate the data before proceeding
        const validationErrors = validateCustomerFields({
          ...customerInput,
          ...(hasAddressUpdate ? { defaultAddress: addressData } : {}),
        });

        if (validationErrors.length > 0) {
          return json(
            {
              success: false,
              error: validationErrors.join(". "),
              validationErrors,
            },
            addCorsHeaders(),
          );
        }

        let responseData;

        // CASE 1: We're updating the customer's address
        if (hasAddressUpdate) {
          console.log("Checking for existing default address");

          // Step 1: Check if customer has a default address
          const customerQuery = `
            query getCustomer($customerId: ID!) {
              customer(id: $customerId) {
                defaultAddress {
                  id
                }
              }
            }
          `;

          const customerResponse = await admin.graphql(customerQuery, {
            variables: {
              customerId: `gid://shopify/Customer/${customerId}`,
            },
          });

          const customerData = await customerResponse.json();
          console.log("Customer data:", customerData);

          // Format address data
          const addressInput = {
            address1: addressData.address1,
            address2: addressData.address2 || "",
            city: addressData.city,
            province: addressData.province,
            provinceCode: addressData.provinceCode,
            zip: addressData.zip,
            country: addressData.country,
            countryCode: addressData.countryCode || addressData.country,
            phone: addressData.phone || "",
          };

          // Check if customer has a default address to update
          const defaultAddressId =
            customerData.data.customer.defaultAddress?.id;

          if (defaultAddressId) {
            // Only update if default address exists
            console.log("Updating existing default address:", defaultAddressId);

            const updateAddressMutation = `
              mutation customerAddressUpdate($customerId: ID!, $addressId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) {
                customerAddressUpdate(input: {
                  customerId: $customerId,
                  addressId: $addressId,
                  setAsDefault: $setAsDefault,
                  address: $address
                }) {
                  customer {
                    id
                    defaultAddress {
                      id
                      address1
                      address2
                      city
                      province
                      provinceCode
                      country
                      countryCode
                      zip
                      phone
                      formatted
                    }
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `;

            const updateResponse = await admin.graphql(updateAddressMutation, {
              variables: {
                customerId: `gid://shopify/Customer/${customerId}`,
                addressId: defaultAddressId,
                address: {
                  address1: addressInput.address1,
                  address2: addressInput.address2,
                  city: addressInput.city,
                  provinceCode:
                    addressInput.provinceCode || addressInput.province,
                  zip: addressInput.zip,
                  countryCode: addressInput.countryCode || addressInput.country,
                  phone: addressInput.phone,
                },
                setAsDefault: true,
              },
            });

            const updateResult = await updateResponse.json();
            console.log("Address update result:", updateResult);

            // Check for errors
            if (
              updateResult.data.customerAddressUpdate.userErrors &&
              updateResult.data.customerAddressUpdate.userErrors.length > 0
            ) {
              const errors = updateResult.data.customerAddressUpdate.userErrors;
              const friendlyErrors = errors.map(
                (e: { field: string; message: string }) => {
                  return getFriendlyErrorMessage(e.field, e.message);
                },
              );

              return json(
                {
                  success: false,
                  error: friendlyErrors.join(". "),
                  details: errors,
                },
                addCorsHeaders(),
              );
            }
          } else {
            // No default address exists, but we're not creating one as per requirements
            console.log("No default address exists. Skipping address update.");

            // If there are other customer fields to update, we'll continue with those
            if (Object.keys(customerInput).length === 0) {
              return json(
                {
                  success: false,
                  error:
                    "Cannot update default address as none exists. Please add an address first via the Shopify account page.",
                },
                addCorsHeaders(),
              );
            }
          }
        }

        // Update basic customer information if there are fields to update
        if (Object.keys(customerInput).length > 0) {
          console.log("Updating customer details:", customerInput);

          const updateMutation = `
            mutation customerUpdate($input: CustomerInput!) {
              customerUpdate(input: $input) {
                customer {
                  id
                  firstName
                  lastName
                  email
                  phone
                  defaultAddress {
                    id
                    address1
                    address2
                    city
                    province
                    provinceCode
                    zip
                    country
                    countryCode
                    phone
                    formatted
                  }
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;

          const response = await admin.graphql(updateMutation, {
            variables: {
              input: {
                id: `gid://shopify/Customer/${customerId}`,
                ...customerInput,
              },
            },
          });

          const result = await response.json();
          console.log("Customer update result:", result);

          // Check for errors
          if (
            result.data.customerUpdate.userErrors &&
            result.data.customerUpdate.userErrors.length > 0
          ) {
            const errors = result.data.customerUpdate.userErrors;
            const friendlyErrors = errors.map(
              (e: { field: string; message: string }) => {
                return getFriendlyErrorMessage(e.field, e.message);
              },
            );

            return json(
              {
                success: false,
                error: friendlyErrors.join(". "),
                details: errors,
              },
              addCorsHeaders(),
            );
          }

          responseData = result.data.customerUpdate.customer;
        }

        // If we haven't set responseData yet (e.g., only updated address), fetch current customer data
        if (!responseData) {
          const finalQuery = `
            query getUpdatedCustomer($customerId: ID!) {
              customer(id: $customerId) {
                id
                firstName
                lastName
                email
                phone
                defaultAddress {
                  id
                  address1
                  address2
                  city
                  province
                  provinceCode
                  zip
                  country
                  countryCode
                  phone
                  formatted
                }
              }
            }
          `;

          const finalResponse = await admin.graphql(finalQuery, {
            variables: {
              customerId: `gid://shopify/Customer/${customerId}`,
            },
          });

          const finalResult = await finalResponse.json();
          console.log("Final customer data:", finalResult);

          responseData = finalResult.data.customer;
        }

        // Success!
        return json(
          {
            success: true,
            customer: responseData,
          },
          addCorsHeaders(),
        );
      } catch (error) {
        console.error("Error updating customer:", error);
        return json(
          {
            success: false,
            error:
              error instanceof Error
                ? `Unable to update your account at this time. Please wait a moment and try again later. Technical details: ${error.message}`
                : "We're unable to update your account right now. Please wait a few minutes and try again later.",
          },
          addCorsHeaders({ status: 500 }),
        );
      }
    }

    // Handle order management actions
    if (
      [
        "refund",
        "cancel",
        "return",
        "exchange",
        "verify_order",
        "order_details",
      ].includes(data.action)
    ) {
      console.log(`Processing ${data.action} request:`, data);

      // Get the order_id or number
      const orderIdentifier = data.order_id;
      const email = data.email;

      if (!orderIdentifier) {
        return json(
          { success: false, error: "Missing order identifier" },
          addCorsHeaders(),
        );
      }

      if (!email) {
        return json(
          { success: false, error: "Missing email address" },
          addCorsHeaders(),
        );
      }

      // First verify the order exists and belongs to this customer
      try {
        // Query to find the order
        const orderQuery = `
          query getOrderByNumber($query: String!) {
            orders(first: 1, query: $query) {
              edges {
                node {
                  id
                  name
                  processedAt
                  cancelledAt
                  displayFulfillmentStatus
                  displayFinancialStatus
                  refundable
                  customer {
                    email
                  }
                  lineItems(first: 10) {
                    edges {
                      node {
                        id
                        name
                        quantity
                        refundableQuantity
                      }
                    }
                  }
                }
              }
            }
          }
        `;

        // Build the query condition - try to match by order number and email
        const queryCondition = `name:${orderIdentifier} AND customer_email:${email}`;

        const orderResponse = await admin.graphql(orderQuery, {
          variables: {
            query: queryCondition,
          },
        });

        const orderData = await orderResponse.json();
        console.log("Order lookup result:", orderData);

        // Check if we found the order
        if (!orderData.data.orders.edges.length) {
          return json(
            {
              success: false,
              error: "Order not found or does not match the provided email",
              verified: false,
            },
            addCorsHeaders(),
          );
        }

        const order = orderData.data.orders.edges[0].node;

        // Add detailed logging about the order state
        console.log("Order details:", {
          id: order.id,
          name: order.name,
          status: order.displayFulfillmentStatus,
          cancelledAt: order.cancelledAt,
          financial_status: order.displayFinancialStatus,
          refundable: order.refundable,
        });

        // Verify the email matches
        if (
          order.customer &&
          order.customer.email.toLowerCase() !== email.toLowerCase()
        ) {
          return json(
            {
              success: false,
              error: "The email address does not match the one on the order",
              verified: false,
            },
            addCorsHeaders(),
          );
        }

        // If this is just a verification request, return success
        if (data.action === "verify_order") {
          return json({ success: true, verified: true }, addCorsHeaders());
        }

        // If this is an order details request, return the order data
        if (data.action === "order_details") {
          // Format the order details in a user-friendly way
          const formattedOrder = {
            id: order.id,
            order_number: order.name.replace("#", ""),
            name: order.name,
            processed_at: order.processedAt,
            status: order.displayFulfillmentStatus,
            financial_status: order.displayFinancialStatus,
            refundable: order.refundable,
            fulfillmentStatus: order.fulfillmentStatus,
            cancelledAt: order.cancelledAt,
            canCancel:
              order.fulfillmentStatus === "UNFULFILLED" && !order.cancelledAt,
            line_items: order.lineItems.edges.map((edge: { node: any }) => ({
              id: edge.node.id,
              title: edge.node.name,
              quantity: edge.node.quantity,
              refundable_quantity: edge.node.refundableQuantity,
              current_quantity: edge.node.currentQuantity,
              price: edge.node.variant ? edge.node.variant.price : null,
              variant_id: edge.node.variant ? edge.node.variant.id : null,
              variant_title: edge.node.variant ? edge.node.variant.title : null,
            })),
          };

          return json(
            { success: true, order: formattedOrder },
            addCorsHeaders(),
          );
        }

        // Process the requested action
        if (data.action === "cancel") {
          // Check if the order can be canceled: unfulfilled and not already canceled
          const canCancel =
            order.displayFulfillmentStatus === "UNFULFILLED" &&
            !order.cancelledAt;

          console.log("Can cancel order?", {
            canCancel,
            status: order.displayFulfillmentStatus,
            cancelledAt: order.cancelledAt,
            financial_status: order.displayFinancialStatus,
          });

          if (canCancel) {
            const cancelQuery = `
      mutation cancelOrder($orderId: ID!) {
        orderCancel(
          notifyCustomer: true
          orderId:        $orderId
          reason:         CUSTOMER
          refund:         true
          restock:        true
        ) {
          job { id done }
          orderCancelUserErrors { field message }
        }
      }
    `;

            const cancelResp = await admin.graphql(cancelQuery, {
              variables: { orderId: order.id },
            });

            const cancelData = await cancelResp.json();
            console.log("Cancel result:", cancelData);

            if (
              cancelData.data.orderCancel.orderCancelUserErrors &&
              cancelData.data.orderCancel.orderCancelUserErrors.length > 0
            ) {
              return json(
                {
                  success: false,
                  error:
                    cancelData.data.orderCancel.orderCancelUserErrors[0]
                      .message,
                },
                addCorsHeaders(),
              );
            }

            return json(
              {
                success: true,
                message: `Order ${order.name} has been cancelled successfully`,
              },
              addCorsHeaders(),
            );
          } else {
            // Check if order is fulfilled
            if (order.displayFulfillmentStatus === "FULFILLED") {
              return json(
                {
                  success: false,
                  error:
                    "This order has already been fulfilled and cannot be cancelled. Once you receive your order, you can initiate a return.",
                  suggest_return: true,
                  order_details: {
                    order_number: order.name,
                    status: order.displayFulfillmentStatus,
                  },
                },
                addCorsHeaders(),
              );
            } else {
              // Let's try to cancel anyway as a fallback
              console.log(
                "Order doesn't appear cancellable, but attempting cancellation anyway as a fallback",
              );

              const cancelQuery = `
        mutation cancelOrder($orderId: ID!) {
          orderCancel(
            notifyCustomer: true
            orderId:        $orderId
            reason:         CUSTOMER
            refund:         true
            restock:        true
          ) {
            job { id done }
            orderCancelUserErrors { field message }
          }
        }
      `;

              try {
                const cancelResp = await admin.graphql(cancelQuery, {
                  variables: { orderId: order.id },
                });

                const cancelData = await cancelResp.json();
                console.log("Fallback cancel result:", cancelData);

                if (
                  cancelData.data.orderCancel.orderCancelUserErrors &&
                  cancelData.data.orderCancel.orderCancelUserErrors.length > 0
                ) {
                  // Real cancellation error
                  return json(
                    {
                      success: false,
                      error:
                        "This order cannot be cancelled at this time. This may be because payment processing has already completed.",
                      suggest_contact: true,
                    },
                    addCorsHeaders(),
                  );
                }

                // If we get here, the cancellation actually succeeded despite our checks
                return json(
                  {
                    success: true,
                    message: `Order ${order.name} has been cancelled successfully`,
                  },
                  addCorsHeaders(),
                );
              } catch (cancelError) {
                console.error("Error in fallback cancellation:", cancelError);
                return json(
                  {
                    success: false,
                    error:
                      "This order cannot be cancelled at this time. This may be because payment processing has already completed.",
                    suggest_contact: true,
                  },
                  addCorsHeaders(),
                );
              }
            }
          }
        }

        // For return and exchange, we would typically create a new return in the system
        // This is more complex and often requires a return merchandise authorization (RMA) process
        // For now, we'll acknowledge the request and provide instructions
        if (data.action === "return" || data.action === "exchange") {
          // In a real implementation, you would initiate the return/exchange process in your system
          const actionType = data.action === "return" ? "return" : "exchange";

          return json(
            {
              success: true,
              message: `Your ${actionType} request for order ${order.name} has been received. Our customer service team will contact you shortly with next steps.`,
              order_number: order.name,
              status: "pending_approval",
            },
            addCorsHeaders(),
          );
        }

        // If we reach here, the requested action wasn't supported
        return json(
          {
            success: false,
            error: `The requested action '${data.action}' is not supported or not available for this order`,
          },
          addCorsHeaders(),
        );
      } catch (error) {
        console.error(`Error processing ${data.action} request:`, error);
        return json(
          {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "An unknown error occurred",
          },
          addCorsHeaders({ status: 500 }),
        );
      }
    }

    // Depending on what you want to do with POST requests
    // This is just a placeholder for now
    return json(
      { success: true, message: "Action processed" },
      addCorsHeaders(),
    );
  } catch (error) {
    console.error("❌ Error in app proxy action:", error);
    return json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to process action",
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      addCorsHeaders({ status: 500 }),
    );
  }
};

// Function to validate customer fields before sending to API
function validateCustomerFields(customer: any): string[] {
  const errors: string[] = [];

  // Validate phone number if provided
  if (customer.phone) {
    // Remove all non-digit characters for validation
    const digitsOnly = customer.phone.replace(/\D/g, "");

    if (digitsOnly.length < 10) {
      errors.push("Phone number must have at least 10 digits");
    } else if (digitsOnly.length > 15) {
      errors.push("Phone number has too many digits");
    }

    // Check if phone contains any valid digits
    if (!/\d/.test(customer.phone)) {
      errors.push("Phone number must contain numeric digits");
    }
  }

  // Validate email if provided
  if (customer.email) {
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
      errors.push(
        "Email address format is invalid. Please provide a valid email (example: name@example.com)",
      );
    }
  }

  // Validate default address if provided
  if (customer.defaultAddress) {
    const address = customer.defaultAddress;

    // Check if the address is an object with the required properties
    if (typeof address !== "object") {
      errors.push(
        "Address must be provided as a complete object with all required fields",
      );
      return errors;
    }

    // Check required address fields
    if (!address.address1 || !String(address.address1).trim()) {
      errors.push("Street address is required");
    }

    if (!address.city || !String(address.city).trim()) {
      errors.push("City is required for the address");
    }

    if (!address.zip || !String(address.zip).trim()) {
      errors.push("ZIP/Postal code is required for the address");
    }

    if (!address.country && !address.countryCode) {
      errors.push("Country is required for the address");
    }

    // Not all jurisdictions require provinces/states, so this is less strict
    if (
      address.country === "United States" ||
      address.country === "US" ||
      address.countryCode === "US" ||
      address.country === "Canada" ||
      address.country === "CA" ||
      address.countryCode === "CA"
    ) {
      if (!address.province && !address.provinceCode) {
        errors.push(
          "State/Province is required for addresses in the US and Canada",
        );
      }
    }
  }

  return errors;
}

// Function to convert API error messages to user-friendly messages
function getFriendlyErrorMessage(field: string, message: string): string {
  // Map of common error messages to more user-friendly versions
  const errorMap: Record<string, string> = {
    // Phone errors
    "phone is invalid":
      "The phone number format is invalid. Please use a standard format like (123) 456-7890 or +1 234 567 8901.",

    // Email errors
    "email is invalid":
      "The email address format is invalid. Please provide a valid email (example: name@example.com).",
    "email has already been taken":
      "This email address is already in use by another account.",

    // Address errors
    "address1 can't be blank": "Street address cannot be empty.",
    "city can't be blank": "City cannot be empty.",
    "province can't be blank": "State/Province cannot be empty.",
    "zip can't be blank": "ZIP/Postal code cannot be empty.",
    "country can't be blank": "Country cannot be empty.",
    "defaultAddress.address1 can't be blank": "Street address cannot be empty.",
    "defaultAddress.city can't be blank": "City cannot be empty.",
    "defaultAddress.province can't be blank": "State/Province cannot be empty.",
    "defaultAddress.zip can't be blank": "ZIP/Postal code cannot be empty.",
    "defaultAddress.country can't be blank": "Country cannot be empty.",

    // Name errors
    "first_name can't be blank": "First name cannot be empty.",
    "last_name can't be blank": "Last name cannot be empty.",
  };

  // Build the lookup key from field and message
  const lookupKey = message.toLowerCase();

  // Check if we have a friendly message for this error
  if (errorMap[lookupKey]) {
    return errorMap[lookupKey];
  }

  // Handle address field errors more cleanly
  if (field && field.startsWith("defaultAddress.")) {
    const addressPart = field.replace("defaultAddress.", "");
    const readableField = addressPart
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());

    return `Address ${readableField}: ${message}`;
  }

  // If the field is specified, create a field-specific message
  if (field) {
    const readableField = field
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());

    return `${readableField}: ${message}`;
  }

  // Default fallback
  return message;
}

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
        // Build customer update mutation
        const customerInput = { ...data.customer };
        const customerId = customerInput.id;
        const hasAddressUpdate = !!customerInput.defaultAddress;
        const addressData = customerInput.defaultAddress;

        // Remove ID and defaultAddress from input as they need special handling
        if (customerInput.id) {
          delete customerInput.id;
        }
        if (customerInput.defaultAddress) {
          delete customerInput.defaultAddress;
        }

        // Check if we have any data to update
        if (Object.keys(customerInput).length === 0 && !hasAddressUpdate) {
          return json(
            { success: false, error: "No valid fields to update" },
            addCorsHeaders(),
          );
        }

        // Validate customer fields
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

        // Different handling based on whether we're updating address or customer details
        let queryResult;

        // If we're updating an address
        if (hasAddressUpdate) {
          // First check if customer has any addresses
          const customerQuery = `
            query getCustomer($customerId: ID!) {
              customer(id: $customerId) {
                addresses(first: 10) {
                  edges {
                    node {
                      id
                    }
                  }
                }
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
          console.log("Customer address check:", customerData);

          // Determine if we need to create a new address or update an existing one
          const existingAddresses =
            customerData.data.customer.addresses?.edges || [];
          const defaultAddressId =
            customerData.data.customer.defaultAddress?.id;

          // Format the address input
          const addressInput = {
            address1: addressData.address1,
            address2: addressData.address2 || "",
            city: addressData.city,
            province: addressData.province,
            zip: addressData.zip,
            country: addressData.country,
            phone: addressData.phone || "",
          };

          let mutation;
          let variables;

          // If this customer has no addresses, create a new one
          if (existingAddresses.length === 0) {
            console.log("Creating new address for customer");
            mutation = `
              mutation customerAddressCreate($customerAddressCreateInput: CustomerAddressCreateInput!) {
                customerAddressCreate(customerAddressCreateInput: $customerAddressCreateInput) {
                  customerAddress {
                    id
                    formatted
                  }
                  customerUserErrors {
                    field
                    message
                  }
                }
              }
            `;

            variables = {
              customerAddressCreateInput: {
                customerId: `gid://shopify/Customer/${customerId}`,
                address: addressInput,
              },
            };
          }
          // If customer has an existing default address, update it
          else if (defaultAddressId) {
            console.log("Updating existing default address");
            mutation = `
              mutation customerAddressUpdate($customerAddressUpdateInput: CustomerAddressUpdateInput!) {
                customerAddressUpdate(customerAddressUpdateInput: $customerAddressUpdateInput) {
                  customerAddress {
                    id
                    formatted
                  }
                  customerUserErrors {
                    field
                    message
                  }
                }
              }
            `;

            variables = {
              customerAddressUpdateInput: {
                customerId: `gid://shopify/Customer/${customerId}`,
                id: defaultAddressId,
                address: addressInput,
              },
            };
          }
          // Otherwise create a new address and set as default
          else {
            console.log("Creating new address and setting as default");
            mutation = `
              mutation customerAddressCreate($customerAddressCreateInput: CustomerAddressCreateInput!) {
                customerAddressCreate(customerAddressCreateInput: $customerAddressCreateInput) {
                  customerAddress {
                    id
                    formatted
                  }
                  customerUserErrors {
                    field
                    message
                  }
                }
              }
            `;

            variables = {
              customerAddressCreateInput: {
                customerId: `gid://shopify/Customer/${customerId}`,
                address: addressInput,
                defaultAddress: true,
              },
            };
          }

          // Execute the address mutation
          const addressResponse = await admin.graphql(mutation, { variables });
          const addressResult = await addressResponse.json();
          console.log("Address update result:", addressResult);

          // Check for address-specific errors
          const operationName = mutation.includes("customerAddressCreate")
            ? "customerAddressCreate"
            : "customerAddressUpdate";

          if (
            addressResult.data[operationName].customerUserErrors &&
            addressResult.data[operationName].customerUserErrors.length > 0
          ) {
            const errors = addressResult.data[operationName].customerUserErrors;
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

          // If we created a new address but it's not the default yet
          if (
            mutation.includes("customerAddressCreate") &&
            variables &&
            "customerAddressCreateInput" in variables &&
            !variables.customerAddressCreateInput.defaultAddress &&
            addressResult.data.customerAddressCreate.customerAddress?.id
          ) {
            // Set the new address as default
            const defaultMutation = `
              mutation customerDefaultAddressUpdate($customerDefaultAddressUpdateInput: CustomerDefaultAddressUpdateInput!) {
                customerDefaultAddressUpdate(customerDefaultAddressUpdateInput: $customerDefaultAddressUpdateInput) {
                  customer {
                    id
                  }
                  customerUserErrors {
                    field
                    message
                  }
                }
              }
            `;

            const defaultResponse = await admin.graphql(defaultMutation, {
              variables: {
                customerDefaultAddressUpdateInput: {
                  customerId: `gid://shopify/Customer/${customerId}`,
                  addressId:
                    addressResult.data.customerAddressCreate.customerAddress.id,
                },
              },
            });

            const defaultResult = await defaultResponse.json();
            console.log("Set default address result:", defaultResult);
          }

          // Now get the updated customer data to return
          const getUpdatedCustomer = `
            query getCustomer($customerId: ID!) {
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

          const updatedResponse = await admin.graphql(getUpdatedCustomer, {
            variables: {
              customerId: `gid://shopify/Customer/${customerId}`,
            },
          });

          queryResult = await updatedResponse.json();
        }
        // If we're only updating customer profile (not address)
        else {
          // Build the GraphQL mutation for customer details only
          const query = `
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

          // Execute the customer update mutation
          const response = await admin.graphql(query, {
            variables: {
              input: {
                id: `gid://shopify/Customer/${customerId}`,
                ...customerInput,
              },
            },
          });

          queryResult = await response.json();
          console.log("Customer update response:", queryResult);

          // Check for errors
          if (
            queryResult.data.customerUpdate.userErrors &&
            queryResult.data.customerUpdate.userErrors.length > 0
          ) {
            const errors = queryResult.data.customerUpdate.userErrors;

            // Transform generic Shopify error messages into more user-friendly ones
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
        }

        // Success!
        return json(
          {
            success: true,
            customer: hasAddressUpdate
              ? queryResult.data.customer
              : queryResult.data.customerUpdate.customer,
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
                ? error.message
                : "Unknown error updating customer",
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

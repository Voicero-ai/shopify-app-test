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

        // Remove ID from input as it's not part of the update input
        if (customerInput.id) {
          delete customerInput.id;
        }

        // Check if we have any data to update
        if (Object.keys(customerInput).length === 0) {
          return json(
            { success: false, error: "No valid fields to update" },
            addCorsHeaders(),
          );
        }

        // Build the GraphQL mutation
        const query = `
          mutation customerUpdate($input: CustomerInput!) {
            customerUpdate(input: $input) {
              customer {
                id
                firstName
                lastName
                email
                phone
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        // Execute the mutation
        const response = await admin.graphql(query, {
          variables: {
            input: {
              id: `gid://shopify/Customer/${customerId}`,
              ...customerInput,
            },
          },
        });

        const responseJson = await response.json();
        console.log("Customer update response:", responseJson);

        // Check for errors
        if (
          responseJson.data.customerUpdate.userErrors &&
          responseJson.data.customerUpdate.userErrors.length > 0
        ) {
          const errors = responseJson.data.customerUpdate.userErrors;
          return json(
            {
              success: false,
              error: errors
                .map((e: { message: string }) => e.message)
                .join("; "),
              details: errors,
            },
            addCorsHeaders(),
          );
        }

        // Success!
        return json(
          {
            success: true,
            customer: responseJson.data.customerUpdate.customer,
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

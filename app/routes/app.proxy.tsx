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

    const response = await admin.graphql(
      `#graphql
      query GetRecentOrders($first: Int!, $minDate: DateTime!, $maxDate: DateTime!) {
        orders(
          first: $first,
          query: "created_at:>='${minDate}' AND created_at:<='${maxDate}'"
        ) {
          edges {
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
        }
      }`,
      {
        variables: {
          first: 50, // Increased to get more orders
          minDate: minDate,
          maxDate: maxDate,
        },
      },
    );

    const responseJson = await response.json();
    console.log("📦 Orders fetched successfully");

    // Output a sample order to logs to verify the data
    if (responseJson.data?.orders?.edges?.length > 0) {
      console.log(
        "Sample order:",
        JSON.stringify(responseJson.data.orders.edges[0], null, 2),
      );
      console.log(
        `Total orders found: ${responseJson.data.orders.edges.length}`,
      );
    } else {
      console.log("No orders found in the response");
    }

    return json(
      {
        success: true,
        orders: responseJson.data.orders,
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

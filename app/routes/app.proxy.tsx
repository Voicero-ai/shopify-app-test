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
  console.log(
    "Request headers:",
    Object.fromEntries([...request.headers.entries()]),
  );

  // Handle preflight requests
  if (request.method.toLowerCase() === "options") {
    return new Response(null, addCorsHeaders({ status: 204 }));
  }

  try {
    const session = await authenticate.public.appProxy(request);
    console.log("Session available:", !!session);

    if (!session) {
      console.log("⚠️ No session available in app proxy");
      return json({ error: "Unauthorized" }, addCorsHeaders({ status: 401 }));
    }

    console.log("✅ Session authenticated successfully");

    // Fetch orders from the Shopify API
    const { admin } = await authenticate.admin(request);
    console.log("Admin API client created");

    const response = await admin.graphql(
      `#graphql
      query {
        orders(first: 10) {
          edges {
            node {
              id
              name
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
              createdAt
              displayFulfillmentStatus
            }
          }
        }
      }`,
    );

    const responseJson = await response.json();
    console.log("📦 Orders fetched successfully");
    console.log("Orders data:", JSON.stringify(responseJson, null, 2));

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

  const session = await authenticate.public.appProxy(request);
  if (!session) {
    console.log("No session available in app proxy action");
    return json({ error: "Unauthorized" }, addCorsHeaders({ status: 401 }));
  }

  // Handle POST/PUT/DELETE requests here
  try {
    const data = await request.json();
    console.log("Received data:", data);

    // Depending on what you want to do with POST requests
    // This is just a placeholder for now
    return json(
      { success: true, message: "Action processed" },
      addCorsHeaders(),
    );
  } catch (error) {
    console.error("Error in app proxy action:", error);
    return json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to process action",
      },
      addCorsHeaders({ status: 500 }),
    );
  }
};
